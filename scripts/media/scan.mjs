import { containsSensitiveAbsolutePath, PROJECTS_FILE, readLocalOutput, redactErrorMessage, sha256File, validateExternalInputRoot, writeLocalOutput } from './safety.mjs';
import { loadProjectCatalog } from './catalog.mjs';
import { inventoryDigest, scanExternalRoot } from './scan-lib.mjs';
import { makeSessionId, mergeHumanDecisions } from './plan-lib.mjs';

async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: npm run media:scan -- <external-master-root>');
  const projectHashBefore = await sha256File(PROJECTS_FILE);
  const catalog = await loadProjectCatalog();
  const resolvedInput = await validateExternalInputRoot(process.argv[2]);
  const previousText = await readLocalOutput('session.json', { optional: true });
  const reviewCsv = await readLocalOutput('review.csv', { optional: true });
  const previous = previousText ? JSON.parse(previousText) : null;

  console.log('Scanning external input read-only (source root is not recorded)...');
  const inventory = await scanExternalRoot(resolvedInput);
  const digest = inventoryDigest(inventory.files);
  const humanDecisions = mergeHumanDecisions({
    previous: previous?.humanDecisions ?? [],
    reviewCsv,
    files: inventory.files,
  });
  const session = {
    schemaVersion: 1,
    sessionId: makeSessionId(digest),
    scannedAt: new Date().toISOString(),
    readOnlyScan: true,
    source: { rootRecorded: false, pathsRecordedAs: 'input-root-relative-only' },
    inventoryDigest: digest,
    projectCatalog: {
      source: 'src/data/projects.json',
      sourceHash: projectHashBefore,
      initialReleaseCount: catalog.initial.length,
      deferredCount: catalog.deferred.length,
    },
    capabilities: inventory.capabilities,
    files: inventory.files,
    skippedLinks: inventory.skippedLinks,
    warnings: inventory.warnings,
    humanDecisions,
  };
  const serialized = `${JSON.stringify(session, null, 2)}\n`;
  if (containsSensitiveAbsolutePath(serialized, resolvedInput)) {
    throw new Error('Safety guard blocked an absolute input path from local output.');
  }
  await writeLocalOutput('session.json', serialized);
  const projectHashAfter = await sha256File(PROJECTS_FILE);
  if (projectHashAfter !== projectHashBefore) throw new Error('projects.json changed during scan; output is invalid.');

  const counts = Object.fromEntries(['image', 'video', 'master', 'unsupported'].map((category) => [
    category,
    session.files.filter((file) => file.category === category).length,
  ]));
  console.log(`Scan complete: ${session.files.length} files (${counts.image} image, ${counts.video} video, ${counts.master} master, ${counts.unsupported} unsupported).`);
  console.log('Local output: .media-ingest/session.json');
  if (!session.capabilities.sharp.available) console.log('Sharp unavailable: image dimensions are reported as unknown; scan continued.');
}

main().catch((error) => {
  console.error(`media:scan failed: ${redactErrorMessage(error)}`);
  process.exitCode = 1;
});
