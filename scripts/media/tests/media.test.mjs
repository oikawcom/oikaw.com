import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { loadProjectCatalog, selectInitialReleaseProjects } from '../catalog.mjs';
import { matchAsset, matchInventory, normalizeForMatch } from '../match.mjs';
import { mergeHumanDecisions } from '../plan-lib.mjs';
import { inventoryDigest, scanExternalRoot } from '../scan-lib.mjs';
import {
  containsSensitiveAbsolutePath,
  REPOSITORY_ROOT,
  redactRelativePath,
  validateExternalInputRoot,
} from '../safety.mjs';

const project = (overrides = {}) => ({
  id: 'project-example-01',
  slug: 'artist-example-title',
  title: 'Example Title',
  year: 2024,
  media: 'Image',
  type: 'Cover Art',
  clientArtists: ['Artist'],
  ...overrides,
});

const asset = (relativePath, category = 'image') => ({
  relativePath,
  basename: relativePath.split('/').at(-1),
  category,
});

test('slug exact match', () => {
  const result = matchAsset(asset('delivery/artist-example-title.jpg'), [project()]);
  assert.equal(result.classification, 'exact');
  assert.equal(result.project.id, 'project-example-01');
});

test('ID exact match', () => {
  const result = matchAsset(asset('delivery/project-example-01/final.png'), [project()]);
  assert.equal(result.classification, 'exact');
});

test('spaces, hyphens, and underscores normalize for strong identifiers', () => {
  const result = matchAsset(asset('Artist Example_Title/final.png'), [project()]);
  assert.equal(result.classification, 'exact');
});

test('Japanese and Unicode NFKC normalization preserves non-ASCII text', () => {
  assert.equal(normalizeForMatch('ＡＢＣ＿テスト'), 'abc テスト');
  const unicodeProject = project({ id: 'project-テスト', slug: 'unicode-test' });
  const result = matchAsset(asset('ＰＲＯＪＥＣＴ＿テスト/image.png'), [unicodeProject]);
  assert.equal(result.classification, 'exact');
});

test('artist + title + year yields high confidence with independent signals', () => {
  const projects = [
    project(),
    project({ id: 'project-other', slug: 'other', title: 'Different Work', year: 2020, clientArtists: ['Someone Else'] }),
  ];
  const result = matchAsset(asset('Artist/2024/Example Title/final.png'), projects);
  assert.equal(result.classification, 'high');
  assert.equal(result.project.id, 'project-example-01');
  assert.ok(result.reasons.some((reason) => reason.includes('runner-up margin')));
});

test('real Cover Art / Music Video collision stays ambiguous without type hint', async () => {
  const catalog = await loadProjectCatalog();
  const collision = catalog.initial.filter(({ title, year, clientArtists }) =>
    title === 'FAIRYTALE feat. Zheani' && year === 2021 && clientArtists.includes('4s4ki'));
  assert.deepEqual(new Set(collision.map(({ type }) => type)), new Set(['Cover Art', 'Music Video']));
  const result = matchAsset(asset('4s4ki/2021/FAIRYTALE feat. Zheani/final.jpg'), collision);
  assert.equal(result.classification, 'ambiguous');
  assert.equal(result.candidates[0].score, result.candidates[1].score);
});

test('unmatched source stays unmatched', () => {
  const result = matchAsset(asset('misc/completely unrelated.bin', 'unsupported'), [project()]);
  assert.equal(result.classification, 'unmatched');
  assert.equal(result.project, null);
});

test('deferred Projects never enter the initial-release candidate allowlist', async () => {
  const catalog = await loadProjectCatalog();
  assert.equal(catalog.initial.length, 74);
  assert.equal(catalog.deferred.length, 3);
  assert.equal(selectInitialReleaseProjects(catalog.all).length, 74);
  const deferred = catalog.deferred[0];
  assert.ok(!catalog.initial.some(({ id }) => id === deferred.id));
  const [result] = matchInventory([asset(`${deferred.slug}/source.jpg`)], catalog.initial, catalog.deferred);
  assert.notEqual(result.project?.id, deferred.id);
  assert.equal(result.deferredHit?.project?.id, deferred.id);
});

test('repository and repository-inside input roots are rejected', async () => {
  await assert.rejects(validateExternalInputRoot(REPOSITORY_ROOT), /disjoint/);
  await assert.rejects(validateExternalInputRoot(join(REPOSITORY_ROOT, 'src')), /disjoint/);
});

test('scan records only redacted relative paths and never the absolute input root', async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'oikaw-media-test-'));
  context.after(async () => {
    assert.ok(resolve(temporaryRoot).startsWith(resolve(tmpdir())));
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  const privateComponent = process.env.USERNAME || process.env.USER || 'private-user';
  await mkdir(join(temporaryRoot, privateComponent), { recursive: true });
  await writeFile(join(temporaryRoot, privateComponent, 'sample.jpg'), 'synthetic-not-an-image');
  const resolvedRoot = await validateExternalInputRoot(temporaryRoot);
  const inventory = await scanExternalRoot(resolvedRoot);
  const sessionLike = {
    source: { rootRecorded: false },
    inventoryDigest: inventoryDigest(inventory.files),
    ...inventory,
  };
  const serialized = JSON.stringify(sessionLike);
  assert.equal(containsSensitiveAbsolutePath(serialized, resolvedRoot), false);
  assert.ok(!serialized.includes(privateComponent));
  assert.equal(inventory.files[0].relativePath, '[redacted-user]/sample.jpg');
  assert.equal(redactRelativePath(`${privateComponent}/sample.jpg`), '[redacted-user]/sample.jpg');
});

test('source-tree symlink or junction is reported and never followed', async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'oikaw-media-link-test-'));
  context.after(async () => {
    assert.ok(resolve(temporaryRoot).startsWith(resolve(tmpdir())));
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  await symlink(REPOSITORY_ROOT, join(temporaryRoot, 'repository-link'), 'junction');
  const inventory = await scanExternalRoot(await validateExternalInputRoot(temporaryRoot));
  assert.equal(inventory.files.length, 0);
  assert.deepEqual(inventory.skippedLinks, [{
    relativePath: 'repository-link',
    reason: 'symlink-or-junction-not-followed',
  }]);
});

test('.media-ingest is ignored by Git', () => {
  const result = spawnSync('git', ['check-ignore', '-q', '.media-ingest/probe'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('Human decisions persist while identical and become stale after fingerprint change', () => {
  const firstFile = {
    relativePath: 'project/source.jpg',
    fingerprint: { kind: 'full-sha256', value: 'aaa' },
  };
  const decision = {
    candidateRelativePath: firstFile.relativePath,
    projectId: 'project-example-01',
    decision: 'approve-for-pilot',
    sourceFingerprint: 'full-sha256:aaa',
  };
  const current = mergeHumanDecisions({ previous: [decision], files: [firstFile] });
  assert.equal(current[0].stale, false);
  const changed = mergeHumanDecisions({
    previous: current,
    files: [{ ...firstFile, fingerprint: { kind: 'full-sha256', value: 'bbb' } }],
  });
  assert.equal(changed[0].stale, true);
  assert.equal(changed[0].staleReason, 'source-fingerprint-changed');
});
