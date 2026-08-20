import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  countMatching,
  createEmptySelection,
  filterGroups,
  matchesFilters,
  prospectiveCount,
  selectedFilters,
  selectionsEqual,
  sortProjects,
  toggleSelection,
} from '../src/lib/works-filter.mjs';
import {
  applyDraft,
  clearDraft,
  createFilterState,
  readFilterState,
  writeFilterState,
} from '../src/lib/filter-state.mjs';
import {
  projectMetadataLabels,
  taxonomyFilterValue,
  taxonomyLabel,
  toFilterProject,
} from '../src/lib/project-metadata.mjs';

const rootUrl = new URL('../', import.meta.url);
const source = JSON.parse(
  await readFile(new URL('src/data/projects.json', rootUrl), 'utf8'),
);
const publishedSource = source.filter(
  ({ initialReleaseScope, publicationStatus }) =>
    initialReleaseScope && publicationStatus !== 'draft',
);
const projects = publishedSource.map(toFilterProject);

assert.equal(source.length, 77, 'Production data must contain 77 Projects.');
assert.equal(projects.length, 74, 'WORKS must use the 74 initial-release Projects.');
assert.equal(new Set(source.map(({ id }) => id)).size, 77, 'Project IDs must be unique.');
assert.equal(new Set(source.map(({ slug }) => slug)).size, 77, 'Project slugs must be unique.');
assert.ok(source.every(({ slug }) => slug), 'Every Project must have a slug.');
assert.ok(
  source.every(({ month }) => month === undefined || Number.isInteger(month) && month >= 1 && month <= 12),
  'Month must be omitted or an integer from 1 through 12.',
);
assert.ok(
  source.every(({ clientArtists }) =>
    Array.isArray(clientArtists) && clientArtists.every((value) => typeof value === 'string' && value)),
  'Every clientArtists value must be an array of nonempty entity strings.',
);

const ids = new Set(source.map(({ id }) => id));
for (const project of source) {
  for (const relatedId of project.explicitRelatedProjects) {
    assert.ok(ids.has(relatedId), `${project.id} references unknown ${relatedId}.`);
    const related = source.find(({ id }) => id === relatedId);
    assert.ok(
      related.explicitRelatedProjects.includes(project.id),
      `${project.id} relation to ${relatedId} must be symmetric.`,
    );
  }
}

assert.equal(
  source.find(({ id }) => id === 'project-4s4ki-h-o-h-02').type,
  'Cover Art',
  'Here or Hell must use Type=Cover Art.',
);
assert.deepEqual(
  projectMetadataLabels,
  [
    'YEAR',
    'MEDIA',
    'TYPE',
    'ROLE',
    'TECHNIQUE',
    'CONTEXT',
    'CLIENT / ARTIST',
    'SERIES / COLLECTION',
  ],
  'All Project Details must use the common metadata label order.',
);
const customTechnique = {
  label: 'Handmade Collage',
  filterAs: 'Other Technique',
};
assert.equal(taxonomyLabel(customTechnique), 'Handmade Collage');
assert.equal(taxonomyFilterValue(customTechnique), 'Other Technique');
assert.deepEqual(
  filterGroups.map(({ label }) => label),
  ['MEDIA', 'TYPE', 'ROLE', 'TECHNIQUE', 'CONTEXT'],
  'Fixed Sidebar taxonomy changed.',
);

const empty = createEmptySelection();
const direction = toggleSelection(empty, 'role', 'Direction');
const directionEditing = toggleSelection(direction, 'role', 'Editing');
const directionEditingCgi = toggleSelection(directionEditing, 'technique', 'CGI');

assert.ok(countMatching(projects, directionEditing) > 0);
assert.ok(countMatching(projects, directionEditingCgi) > 0);
assert.equal(
  countMatching(projects, directionEditing),
  projects.filter(({ roles }) => roles.includes('Direction') && roles.includes('Editing')).length,
  'ROLE values must use AND logic.',
);
assert.equal(
  countMatching(projects, directionEditingCgi),
  projects.filter(({ roles, techniques }) =>
    roles.includes('Direction') && roles.includes('Editing') && techniques.includes('CGI')).length,
  'Categories must use AND logic.',
);

const video = toggleSelection(empty, 'media', 'Video');
assert.equal(
  prospectiveCount(projects, video, 'media', 'Image'),
  0,
  'A zero-result prospective MEDIA tag must be detectable before APPLY.',
);
assert.equal(
  prospectiveCount(projects, direction, 'technique', 'CGI'),
  countMatching(projects, toggleSelection(direction, 'technique', 'CGI')),
  'Prospective count must represent adding the candidate tag with AND.',
);

const solo = toggleSelection(empty, 'role', 'Solo Production');
assert.equal(
  countMatching(projects, solo),
  projects.filter(({ scope }) => scope === 'solo-production').length,
  'Solo Production must map to scope rather than roles.',
);

const applied = createEmptySelection();
const draft = toggleSelection(applied, 'role', 'Direction');
assert.equal(countMatching(projects, applied), 74, 'Applied state changed prematurely.');
assert.equal(matchesFilters(projects[0], applied), true);
assert.equal(selectionsEqual(applied, draft), false, 'Draft change was not detected.');

const appliedCombination = createFilterState({ draft: directionEditingCgi, applied: directionEditingCgi });
const clearedCombination = clearDraft(appliedCombination);
assert.equal(countMatching(projects, clearedCombination.applied), 14);
assert.equal(countMatching(projects, clearedCombination.draft), 74);
assert.equal(selectedFilters(clearedCombination.draft).length, 0);
assert.equal(countMatching(projects, applyDraft(clearedCombination).applied), 74);

const videoMusicVideoDirection = toggleSelection(
  toggleSelection(video, 'type', 'Music Video'),
  'role',
  'Direction',
);
const chipRemovalState = createFilterState({
  draft: videoMusicVideoDirection,
  applied: videoMusicVideoDirection,
});
const withoutMusicVideo = createFilterState({
  draft: toggleSelection(chipRemovalState.draft, 'type', 'Music Video'),
  applied: chipRemovalState.applied,
});
assert.deepEqual(
  selectedFilters(withoutMusicVideo.draft).map(({ value }) => value),
  ['Video', 'Direction'],
  'Removing one tray chip must update only draft state.',
);
assert.deepEqual(withoutMusicVideo.applied, chipRemovalState.applied);

const fourS4ki = toggleSelection(empty, 'clientArtist', '4s4ki');
assert.ok(countMatching(projects, fourS4ki) > 0, 'Client / Artist must be filterable.');
assert.ok(
  projects.filter((project) => matchesFilters(project, fourS4ki))
    .every(({ clientArtists }) => clientArtists.includes('4s4ki')),
  'Client / Artist must use array membership.',
);

const multiEntity = source.find(({ id }) => id === 'project-4s4ki-artwork-2020-03');
assert.deepEqual(multiEntity.clientArtists, ['4s4ki', 'Masayoshi Iimori']);
for (const entity of multiEntity.clientArtists) {
  const selection = toggleSelection(empty, 'clientArtist', entity);
  assert.ok(
    projects.some((project) => project.id === multiEntity.id && matchesFilters(project, selection)),
    `${multiEntity.id} must match the ${entity} entity facet.`,
  );
}

const dynamicCombination = toggleSelection(
  toggleSelection(
    toggleSelection(empty, 'year', '2022'),
    'clientArtist',
    '4s4ki',
  ),
  'series',
  '4s4ki Music Videos',
);
assert.ok(countMatching(projects, dynamicCombination) > 0);
assert.ok(
  projects.filter((project) => matchesFilters(project, dynamicCombination)).every((project) =>
    project.year === 2022 &&
    project.clientArtists.includes('4s4ki') &&
    project.series === '4s4ki Music Videos'),
  'Year + Client / Artist + Series must use AND logic.',
);

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
};
writeFilterState(appliedCombination, storage);
assert.deepEqual(readFilterState(storage), appliedCombination);

const dateFixtures = [
  { id: 'unknown-year', slug: 'unknown-year' },
  { id: 'unknown-month-a', slug: 'unknown-month-a', year: 2022 },
  { id: 'december', slug: 'december', year: 2022, month: 12 },
  { id: 'january', slug: 'january', year: 2022, month: 1 },
  { id: 'unknown-month-b', slug: 'unknown-month-b', year: 2022 },
];
assert.deepEqual(
  sortProjects(dateFixtures, 'newest').map(({ id }) => id),
  ['december', 'january', 'unknown-month-a', 'unknown-month-b', 'unknown-year'],
  'Newest sorting must use year/month, then stable unknown-month order.',
);
assert.deepEqual(
  sortProjects(dateFixtures, 'oldest').map(({ id }) => id),
  ['january', 'december', 'unknown-month-a', 'unknown-month-b', 'unknown-year'],
  'Oldest sorting must use year/month while unknown dates remain last.',
);

const fourS4kiGroupedPaths = new Set([
  '/4s4ki-artwork-2020', '/4s4ki-artwork-2021', '/4s4ki-artwork-2022',
  '/4s4ki-h-o-h', '/4s4ki-mvs-2020', '/4s4ki-mvs-2021-1st',
  '/4s4ki-mvs-2021-2nd', '/4s4ki-mvs-2022-1st', '/4s4ki-mvs-2022-2nd',
  '/4s4ki-mvs-undeadcyborg',
]);
const fourS4kiSplit = source.filter(({ legacyPaths }) =>
  legacyPaths.some((path) => fourS4kiGroupedPaths.has(path)),
);
assert.equal(fourS4kiSplit.length, 31);
assert.ok(fourS4kiSplit.every(({ slug }) => slug.startsWith('4s4ki-')));
assert.ok(source.every(({ slug }) => !slug.includes('4s4ki-4s4ki')));
assert.equal(multiEntity.slug, '4s4ki-iei-ni-yeah');

const expectedKlooz = new Map([
  ['project-klooz-seasons-01', 'klooz-seasons-find-you'],
  ['project-klooz-seasons-02', 'klooz-seasons-you-are'],
  ['project-klooz-seasons-03', 'klooz-seasons-lack-of-communication'],
]);
const expectedVr = new Map([
  ['project-as-01', 'vr-sculpture-01'],
  ['project-as-02', 'vr-sculpture-02'],
  ['project-as-03', 'vr-sculpture-03'],
  ['project-as-04', 'vr-sculpture-04'],
  ['project-as-05', 'vr-sculpture-05'],
  ['project-06-emitter', 'vr-sculpture-06'],
  ['project-07-luck', 'vr-sculpture-07'],
  ['project-08-daydream', 'vr-sculpture-08'],
]);
for (const [id, slug] of [...expectedKlooz, ...expectedVr]) {
  assert.equal(source.find((project) => project.id === id).slug, slug);
}

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(value); value = ''; }
    else if (character === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
};
const normalizationRows = parseCsv(
  await readFile(new URL('docs/migration/project-normalization.csv', rootUrl), 'utf8'),
);
const normalizationHeader = normalizationRows[0];
const normalizationById = new Map(normalizationRows.slice(1).map((row) => [row[0], row]));
assert.equal(normalizationRows.length - 1, 77);
for (const project of source) {
  assert.equal(
    normalizationById.get(project.id)?.[normalizationHeader.indexOf('proposed_slug')],
    project.slug,
    `Migration slug must match production for ${project.id}.`,
  );
}

const indexSource = await readFile(new URL('src/pages/index.astro', rootUrl), 'utf8');
const worksSource = await readFile(new URL('src/pages/works.astro', rootUrl), 'utf8');
const aboutSource = await readFile(new URL('src/pages/about.astro', rootUrl), 'utf8');
const detailSource = await readFile(new URL('src/pages/[id].astro', rootUrl), 'utf8');
const layoutSource = await readFile(new URL('src/layouts/BaseLayout.astro', rootUrl), 'utf8');
const styleSource = await readFile(new URL('src/styles/global.css', rootUrl), 'utf8');
assert.ok(indexSource.includes('top-main-visual'));
assert.ok(indexSource.includes("import siteContent from '../data/site.json'"));
assert.ok(!indexSource.includes('Featured Works'));
assert.ok(!indexSource.includes('Featured projects will be presented here.'));
assert.ok(worksSource.includes('data-works-page'));
assert.ok(aboutSource.includes('activeNav="profile"'));
assert.ok(aboutSource.includes('about-portrait-placeholder'));
assert.ok(aboutSource.includes('data-contact-form'));
assert.ok(aboutSource.includes('event.preventDefault()'));
assert.ok(detailSource.includes("window.location.assign('/works')"));
assert.ok(layoutSource.includes('href="/works"') && layoutSource.includes('href="/about"'));
assert.ok(styleSource.includes('.sticky-filter-toolbar::before'));
assert.ok(styleSource.includes('--tray-fade-overscan'));
assert.ok(styleSource.includes('inset: 5px'));

console.log('RESULT: PASS');
console.log(`Projects=${source.length}`);
console.log(`InitialRelease=${projects.length}`);
console.log(`Direction+Editing=${countMatching(projects, directionEditing)}`);
console.log(`Direction+Editing+CGI=${countMatching(projects, directionEditingCgi)}`);
console.log(`Dynamic2022+4s4ki+Series=${countMatching(projects, dynamicCombination)}`);
console.log('AND/prospective-count/zero-disable/draft-vs-applied/clear/chip-removal/session/sort=PASS');
console.log('IDs/slugs/month/clientArtists/relations/detail-labels/migration/routes=PASS');
