import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const INGEST_ROOT = resolve(REPOSITORY_ROOT, '.media-ingest');
export const PROJECTS_FILE = resolve(REPOSITORY_ROOT, 'src/data/projects.json');

function normalizedForComparison(value) {
  const resolved = resolve(value);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
}

function isSameOrInside(candidate, parent) {
  const difference = relative(normalizedForComparison(parent), normalizedForComparison(candidate));
  return difference === '' || (!difference.startsWith(`..${sep}`) && difference !== '..' && !isAbsolute(difference));
}

export async function validateExternalInputRoot(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Usage: npm run media:scan -- <external-master-root>');
  }

  let inputStat;
  try {
    inputStat = await lstat(input);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('Input root does not exist.');
    throw error;
  }
  if (!inputStat.isDirectory()) throw new Error('Input root must be a directory.');

  const [resolvedInput, resolvedRepository] = await Promise.all([
    realpath(input),
    realpath(REPOSITORY_ROOT),
  ]);
  if (
    isSameOrInside(resolvedInput, resolvedRepository) ||
    isSameOrInside(resolvedRepository, resolvedInput)
  ) {
    throw new Error('Input root must be disjoint from the current Git repository.');
  }

  return resolvedInput;
}

export function assertSafeRelativePath(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) {
    throw new Error('Source paths must be nonempty paths relative to the input root.');
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('Source path escapes the input root.');
  }
  return normalized;
}

export function redactRelativePath(value) {
  const username = process.env.USERNAME || process.env.USER || '';
  const homeName = homedir().split(/[\\/]/).filter(Boolean).at(-1) ?? '';
  const privateNames = new Set(
    [username, homeName].filter(Boolean).map((part) => part.normalize('NFKC').toLocaleLowerCase('en-US')),
  );
  return assertSafeRelativePath(value)
    .split('/')
    .map((part) => privateNames.has(part.normalize('NFKC').toLocaleLowerCase('en-US')) ? '[redacted-user]' : part)
    .join('/');
}

function outputPath(relativeName) {
  const destination = resolve(INGEST_ROOT, relativeName);
  if (!isSameOrInside(destination, INGEST_ROOT) || destination === INGEST_ROOT) {
    throw new Error('Local output path escaped .media-ingest/.');
  }
  return destination;
}

export async function writeLocalOutput(relativeName, contents) {
  assertIngestIgnored();
  const destination = outputPath(relativeName);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents, 'utf8');
}

export function assertIngestIgnored() {
  const result = spawnSync('git', ['check-ignore', '-q', '.media-ingest/safety-probe'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error('.media-ingest/ is not ignored by Git; refusing to write local inventory.');
  }
}

export async function readLocalOutput(relativeName, { optional = false } = {}) {
  try {
    return await readFile(outputPath(relativeName), 'utf8');
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function sha256File(filename) {
  const bytes = await readFile(filename);
  return createHash('sha256').update(bytes).digest('hex');
}

export function containsSensitiveAbsolutePath(serialized, absoluteRoot) {
  const variants = new Set([
    absoluteRoot,
    absoluteRoot.replaceAll('\\', '/'),
    absoluteRoot.replaceAll('/', '\\'),
  ]);
  return [...variants].some((value) => value && serialized.includes(value));
}

export function redactErrorMessage(error) {
  let message = String(error?.message ?? error);
  for (const sensitiveRoot of [homedir(), REPOSITORY_ROOT]) {
    if (!sensitiveRoot) continue;
    message = message
      .replaceAll(sensitiveRoot, '[local-path-redacted]')
      .replaceAll(sensitiveRoot.replaceAll('\\', '/'), '[local-path-redacted]');
  }
  return message.replace(/[A-Za-z]:[\\/][^\r\n]*/g, '[absolute-path-redacted]');
}
