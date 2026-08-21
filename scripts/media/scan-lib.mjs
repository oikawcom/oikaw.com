import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { assertSafeRelativePath, redactRelativePath } from './safety.mjs';

const SMALL_FILE_HASH_LIMIT = 32 * 1024 * 1024;
const LARGE_FILE_SAMPLE_SIZE = 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([
  '.avif', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.svg', '.tif', '.tiff', '.webp',
]);
const VIDEO_EXTENSIONS = new Set([
  '.avi', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.webm',
]);
const MASTER_EXTENSIONS = new Set([
  '.3fr', '.ai', '.arw', '.blend', '.c4d', '.cr2', '.cr3', '.dng', '.eps', '.exr',
  '.indd', '.indb', '.nef', '.orf', '.otio', '.prproj', '.psb', '.psd', '.raf',
  '.raw', '.rw2', '.sesx', '.xcf', '.aep',
]);

export function categorizeExtension(extension) {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (MASTER_EXTENSIONS.has(extension)) return 'master';
  return 'unsupported';
}

async function hashStream(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function fingerprintFile(filename, size) {
  if (size <= SMALL_FILE_HASH_LIMIT) {
    return {
      kind: 'full-sha256',
      value: await hashStream(filename),
      identityGuarantee: 'content-hash',
    };
  }

  const handle = await open(filename, 'r');
  try {
    const sampleLength = Math.min(LARGE_FILE_SAMPLE_SIZE, size);
    const first = Buffer.alloc(sampleLength);
    const last = Buffer.alloc(sampleLength);
    const firstRead = await handle.read(first, 0, sampleLength, 0);
    const lastRead = await handle.read(last, 0, sampleLength, Math.max(0, size - sampleLength));
    const hash = createHash('sha256')
      .update('media-ingest-sample-v1\0')
      .update(String(size))
      .update('\0')
      .update(first.subarray(0, firstRead.bytesRead))
      .update(last.subarray(0, lastRead.bytesRead))
      .digest('hex');
    return {
      kind: 'sample-sha256-v1',
      value: hash,
      identityGuarantee: 'non-identity-fingerprint',
      sampledBytes: firstRead.bytesRead + lastRead.bytesRead,
    };
  } finally {
    await handle.close();
  }
}

async function loadSharpCapability() {
  try {
    const module = await import('sharp');
    return { available: true, sharp: module.default, version: module.default?.versions?.sharp ?? null };
  } catch (error) {
    return { available: false, sharp: null, version: null, reason: error?.code ?? 'load-failed' };
  }
}

async function readImageMetadata(filename, sharpCapability) {
  if (!sharpCapability.available) {
    return { status: 'unknown', reason: 'sharp-unavailable' };
  }
  try {
    const metadata = await sharpCapability.sharp(filename, {
      failOn: 'none',
      sequentialRead: true,
    }).metadata();
    const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation);
    const width = swapsDimensions ? metadata.height : metadata.width;
    const height = swapsDimensions ? metadata.width : metadata.height;
    return {
      status: width && height ? 'available' : 'unknown',
      width: width ?? null,
      height: height ?? null,
      aspectRatio: width && height ? Number((width / height).toFixed(6)) : null,
      hasAlpha: typeof metadata.hasAlpha === 'boolean' ? metadata.hasAlpha : null,
      orientation: metadata.orientation ?? null,
      orientationAppliedToDimensions: swapsDimensions,
      format: metadata.format ?? null,
      pages: metadata.pages ?? null,
    };
  } catch (error) {
    return { status: 'unknown', reason: error?.code ?? 'metadata-read-failed' };
  }
}

function safePathParts(relativePath) {
  const parts = relativePath.split('/');
  return {
    relativePath,
    basename: parts.at(-1),
    parentFolders: parts.slice(0, -1),
  };
}

export async function scanExternalRoot(resolvedInputRoot, { onProgress } = {}) {
  const sharpCapability = await loadSharpCapability();
  const files = [];
  const skippedLinks = [];
  const warnings = [];
  const pending = [''];

  while (pending.length > 0) {
    const directoryRelative = pending.pop();
    const directoryAbsolute = directoryRelative
      ? join(resolvedInputRoot, directoryRelative)
      : resolvedInputRoot;
    let entries;
    try {
      entries = await readdir(directoryAbsolute, { withFileTypes: true });
    } catch (error) {
      if (!directoryRelative) throw new Error(`Unable to read input root (${error?.code ?? 'read-failed'}).`);
      warnings.push({
        code: 'directory-unreadable',
        relativePath: redactRelativePath(directoryRelative),
        detail: error?.code ?? 'read-failed',
      });
      continue;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, 'und'));
    for (const entry of entries) {
      const rawRelative = directoryRelative ? join(directoryRelative, entry.name) : entry.name;
      const normalizedRelative = assertSafeRelativePath(rawRelative.replaceAll('\\', '/'));
      const safeRelative = redactRelativePath(normalizedRelative);
      const absolute = join(resolvedInputRoot, rawRelative);

      let entryStat;
      try {
        entryStat = await lstat(absolute);
      } catch (error) {
        warnings.push({ code: 'entry-unreadable', relativePath: safeRelative, detail: error?.code ?? 'stat-failed' });
        continue;
      }
      if (entry.isSymbolicLink() || entryStat.isSymbolicLink()) {
        skippedLinks.push({ relativePath: safeRelative, reason: 'symlink-or-junction-not-followed' });
        continue;
      }
      if (entryStat.isDirectory()) {
        pending.push(rawRelative);
        continue;
      }
      if (!entryStat.isFile()) {
        skippedLinks.push({ relativePath: safeRelative, reason: 'non-regular-entry-not-read' });
        continue;
      }

      const extension = extname(entry.name).toLocaleLowerCase('en-US');
      const category = categorizeExtension(extension);
      try {
        const fingerprint = await fingerprintFile(absolute, entryStat.size);
        const metadata = category === 'image'
          ? await readImageMetadata(absolute, sharpCapability)
          : { status: 'not-requested' };
        files.push({
          ...safePathParts(safeRelative),
          extension: extension || null,
          size: entryStat.size,
          category,
          publicationSuitability: category === 'master' || category === 'unsupported'
            ? 'derivative-source-or-unsupported; direct-publication-not-approved'
            : 'candidate-only; publication-not-approved',
          fingerprint,
          metadata,
        });
        onProgress?.(files.length);
      } catch (error) {
        warnings.push({ code: 'file-read-failed', relativePath: safeRelative, detail: error?.code ?? 'read-failed' });
      }
    }
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'und', { numeric: true }));
  return {
    files,
    skippedLinks,
    warnings,
    capabilities: {
      sharp: sharpCapability.available
        ? { available: true, version: sharpCapability.version }
        : { available: false, reason: sharpCapability.reason },
      ffprobe: { used: false, reason: 'not-required-and-not-installed-by-tool' },
    },
  };
}

export function inventoryDigest(files) {
  return createHash('sha256')
    .update(JSON.stringify(files.map(({ relativePath, size, fingerprint }) => ({ relativePath, size, fingerprint }))))
    .digest('hex');
}
