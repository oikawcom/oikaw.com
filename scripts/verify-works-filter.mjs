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

const source = JSON.parse(
  await readFile(new URL('../src/data/projects.json', import.meta.url), 'utf8'),
);
const projects = source.filter(
  ({ initialReleaseScope, publicationStatus }) =>
    initialReleaseScope && publicationStatus !== 'draft',
);

assert.equal(projects.length, 74, 'WORKS must use the 74 initial-release Projects.');
assert.deepEqual(
  filterGroups.map(({ label }) => label),
  ['MEDIA', 'TYPE', 'ROLE', 'TECHNIQUE', 'CONTEXT'],
  'Filter category order changed.',
);

const empty = createEmptySelection();
const direction = toggleSelection(empty, 'role', 'Direction');
const directionEditing = toggleSelection(direction, 'role', 'Editing');
const directionEditingCgi = toggleSelection(directionEditing, 'technique', 'CGI');

assert.ok(
  countMatching(projects, directionEditing) > 0,
  'Representative same-category AND combination should match Projects.',
);
assert.ok(
  countMatching(projects, directionEditingCgi) > 0,
  'Representative cross-category AND combination should match Projects.',
);
assert.equal(
  countMatching(projects, directionEditing),
  projects.filter(
    ({ roles }) => roles.includes('Direction') && roles.includes('Editing'),
  ).length,
  'ROLE values must use AND logic.',
);
assert.equal(
  countMatching(projects, directionEditingCgi),
  projects.filter(
    ({ roles, techniques }) =>
      roles.includes('Direction') &&
      roles.includes('Editing') &&
      techniques.includes('CGI'),
  ).length,
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
assert.ok(
  projects.every(({ roles }) => !roles.includes('Solo Production')),
  'Solo Production must not enter Production ROLE data.',
);

const applied = createEmptySelection();
const draft = toggleSelection(applied, 'role', 'Direction');
assert.equal(countMatching(projects, applied), 74, 'Applied state changed prematurely.');
assert.equal(
  matchesFilters(projects[0], applied),
  true,
  'Empty applied selection should leave the grid unchanged.',
);
assert.equal(selectionsEqual(applied, draft), false, 'Draft change was not detected.');

const appliedCombination = createFilterState({
  draft: directionEditingCgi,
  applied: directionEditingCgi,
});
const clearedCombination = clearDraft(appliedCombination);
assert.equal(
  countMatching(projects, clearedCombination.applied),
  14,
  'CLEAR ALL must not change the applied grid immediately.',
);
assert.equal(
  countMatching(projects, clearedCombination.draft),
  74,
  'CLEAR ALL must reset prospective draft counts to the empty selection.',
);
assert.equal(
  selectedFilters(clearedCombination.draft).length,
  0,
  'CLEAR ALL must remove every draft chip.',
);

const appliedEmpty = applyDraft(clearedCombination);
assert.equal(
  countMatching(projects, appliedEmpty.applied),
  74,
  'Applying an empty draft must restore All Works.',
);

const videoAfterClear = applyDraft(
  createFilterState({ draft: video, applied: clearedCombination.applied }),
);
assert.equal(
  countMatching(projects, videoAfterClear.applied),
  countMatching(projects, video),
  'A new draft after CLEAR ALL must replace the previous applied selection.',
);

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
  'Removing one tray chip must update only the draft selection.',
);
assert.deepEqual(
  withoutMusicVideo.applied,
  chipRemovalState.applied,
  'Removing one tray chip must preserve the applied selection.',
);
assert.equal(
  countMatching(projects, withoutMusicVideo.applied),
  countMatching(projects, chipRemovalState.applied),
  'Removing one tray chip must not change the grid before APPLY.',
);

const withoutAnyChips = createFilterState({
  draft: toggleSelection(
    toggleSelection(withoutMusicVideo.draft, 'media', 'Video'),
    'role',
    'Direction',
  ),
  applied: withoutMusicVideo.applied,
});
assert.equal(
  selectedFilters(withoutAnyChips.draft).length,
  0,
  'Removing every tray chip manually must leave an empty draft.',
);
assert.equal(
  countMatching(projects, withoutAnyChips.applied),
  countMatching(projects, chipRemovalState.applied),
  'Removing every tray chip must preserve the applied grid before APPLY.',
);
assert.equal(
  countMatching(projects, applyDraft(withoutAnyChips).applied),
  74,
  'Applying after every tray chip is removed must restore All Works.',
);

const fourS4ki = toggleSelection(empty, 'clientArtist', '4s4ki');
assert.ok(countMatching(projects, fourS4ki) > 0, 'Client / Artist must be filterable.');
assert.ok(
  projects
    .filter((project) => matchesFilters(project, fourS4ki))
    .every(({ clientArtist }) => clientArtist === '4s4ki'),
  'Client / Artist filtering must use confirmed production metadata.',
);

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
};
writeFilterState(appliedCombination, storage);
assert.deepEqual(
  readFilterState(storage),
  appliedCombination,
  'Versioned session persistence must preserve draft and applied selections.',
);

for (const order of ['newest', 'oldest']) {
  const sorted = sortProjects(projects, order);
  assert.equal(sorted.length, projects.length, `${order} sorting lost Projects.`);
  assert.equal(new Set(sorted.map(({ id }) => id)).size, 74, `${order} sorting duplicated Projects.`);
}

console.log('RESULT: PASS');
console.log(`Projects=${projects.length}`);
console.log(`Direction+Editing=${countMatching(projects, directionEditing)}`);
console.log(`Direction+Editing+CGI=${countMatching(projects, directionEditingCgi)}`);
console.log(`Solo Production=${countMatching(projects, solo)}`);
console.log(`4s4ki=${countMatching(projects, fourS4ki)}`);
console.log('AND/prospective-count/zero-disable/draft-vs-applied/clear/chip-removal/session/sort=PASS');
