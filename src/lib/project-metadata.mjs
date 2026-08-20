export const projectMetadataLabels = Object.freeze([
  'YEAR',
  'MEDIA',
  'TYPE',
  'ROLE',
  'TECHNIQUE',
  'CONTEXT',
  'CLIENT / ARTIST',
  'SERIES / COLLECTION',
]);

export function taxonomyLabel(value) {
  return typeof value === 'string' ? value : value?.label;
}

export function taxonomyFilterValue(value) {
  return typeof value === 'string' ? value : value?.filterAs;
}

export function taxonomyFilterValues(values = []) {
  return values.map(taxonomyFilterValue).filter(Boolean);
}

export function toFilterProject(project) {
  return {
    id: project.id,
    slug: project.slug,
    year: project.year,
    month: project.month,
    media: taxonomyFilterValue(project.media),
    type: taxonomyFilterValue(project.type),
    roles: taxonomyFilterValues(project.roles),
    techniques: taxonomyFilterValues(project.techniques),
    context: project.context,
    scope: project.scope,
    clientArtists: project.clientArtists ?? [],
    series: project.seriesCollection,
  };
}
