export const filterGroups = Object.freeze([
  {
    key: 'media',
    label: 'MEDIA',
    values: ['Video', 'Image', 'Sculpture', 'Other Media'],
  },
  {
    key: 'type',
    label: 'TYPE',
    values: [
      'Music Video',
      'Visualizer',
      'Promo',
      'Broadcast',
      'Cover Art',
      'Portrait',
      'Photo',
      'Logo',
      'Other Type',
    ],
  },
  {
    key: 'role',
    label: 'ROLE',
    values: [
      'Direction',
      'Production',
      'Cinematography',
      'Editing',
      'Motion Design',
      '3D',
      'VFX',
      'Art Direction',
      'Graphic Design',
      'Photography',
      'Illustration',
      'Solo Production',
    ],
  },
  {
    key: 'technique',
    label: 'TECHNIQUE',
    values: [
      'Live Action',
      'CGI',
      'Animation',
      'Design',
      'Drawing',
      'Physical',
      'VR Modeling',
      'Generative AI',
      'Mixed Media',
      'Other Technique',
    ],
  },
  {
    key: 'context',
    label: 'CONTEXT',
    values: ['Client', 'Personal'],
  },
]);

export const dynamicFilterCategories = Object.freeze([
  'clientArtist',
  'year',
  'series',
]);
export const selectionCategories = Object.freeze([
  ...filterGroups.map(({ key }) => key),
  ...dynamicFilterCategories,
]);

export function createEmptySelection() {
  return Object.fromEntries(selectionCategories.map((key) => [key, []]));
}

export function cloneSelection(selection) {
  return Object.fromEntries(
    selectionCategories.map((key) => [key, [...(selection[key] ?? [])]]),
  );
}

export function toggleSelection(selection, category, value) {
  const next = cloneSelection(selection);
  const values = next[category] ?? [];
  const index = values.indexOf(value);

  if (index === -1) values.push(value);
  else values.splice(index, 1);

  return next;
}

function projectValues(project, category) {
  switch (category) {
    case 'media':
      return project.media ? [project.media] : [];
    case 'type':
      return project.type ? [project.type] : [];
    case 'role':
      return [
        ...(project.roles ?? []),
        ...(project.scope === 'solo-production' ? ['Solo Production'] : []),
      ];
    case 'technique':
      return project.techniques ?? [];
    case 'context':
      return project.context ? [project.context] : [];
    case 'clientArtist':
      return project.clientArtists ?? [];
    case 'year':
      return Number.isInteger(project.year) ? [String(project.year)] : [];
    case 'series':
      return project.series ? [project.series] : [];
    default:
      return [];
  }
}

export function matchesFilters(project, selection) {
  return selectionCategories.every((key) =>
    (selection[key] ?? []).every((value) => projectValues(project, key).includes(value)),
  );
}

export function countMatching(projects, selection) {
  return projects.reduce(
    (count, project) => count + Number(matchesFilters(project, selection)),
    0,
  );
}

export function prospectiveCount(projects, selection, category, value) {
  const selected = (selection[category] ?? []).includes(value);
  const prospectiveSelection = selected
    ? selection
    : toggleSelection(selection, category, value);

  return countMatching(projects, prospectiveSelection);
}

export function selectionsEqual(left, right) {
  return selectionCategories.every((key) => {
    const leftValues = [...(left[key] ?? [])].sort();
    const rightValues = [...(right[key] ?? [])].sort();
    return leftValues.join('\u001f') === rightValues.join('\u001f');
  });
}

export function selectedFilters(selection) {
  return selectionCategories.flatMap((key) =>
    (selection[key] ?? []).map((value) => ({ category: key, value })),
  );
}

export function sortProjects(projects, order = 'newest') {
  return projects
    .map((project, index) => ({ project, index }))
    .sort((leftEntry, rightEntry) => {
    const left = leftEntry.project;
    const right = rightEntry.project;
    const leftYear = Number.isInteger(left.year) ? left.year : null;
    const rightYear = Number.isInteger(right.year) ? right.year : null;

    if (leftYear === null && rightYear !== null) return 1;
    if (leftYear !== null && rightYear === null) return -1;
    if (leftYear !== null && rightYear !== null && leftYear !== rightYear) {
      return order === 'oldest' ? leftYear - rightYear : rightYear - leftYear;
    }

    const leftMonth = Number.isInteger(left.month) ? left.month : null;
    const rightMonth = Number.isInteger(right.month) ? right.month : null;

    if (leftMonth === null && rightMonth !== null) return 1;
    if (leftMonth !== null && rightMonth === null) return -1;
    if (leftMonth !== null && rightMonth !== null && leftMonth !== rightMonth) {
      return order === 'oldest' ? leftMonth - rightMonth : rightMonth - leftMonth;
    }

    return leftEntry.index - rightEntry.index;
  })
    .map(({ project }) => project);
}
