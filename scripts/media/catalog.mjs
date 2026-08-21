import { readFile } from 'node:fs/promises';

import { PROJECTS_FILE } from './safety.mjs';

// This is a validation of the repository's current published-data contract, not
// an allowlist implementation. IDs are always selected from the live data using
// the same predicate as getPublishedProjects(). A count change must be reviewed.
export const EXPECTED_INITIAL_RELEASE_COUNT = 74;

const taxonomyText = (value) =>
  typeof value === 'string' ? value : value?.label ?? '';

export function selectInitialReleaseProjects(projects) {
  return projects.filter(
    ({ initialReleaseScope, publicationStatus }) =>
      initialReleaseScope && publicationStatus !== 'draft',
  );
}

export function validateAndSplitProjects(projects) {
  if (!Array.isArray(projects)) {
    throw new Error('projects.json must contain an array.');
  }

  const ids = new Set();
  const slugs = new Set();
  for (const project of projects) {
    if (!project || typeof project !== 'object') {
      throw new Error('Every Project must be an object.');
    }
    for (const key of ['id', 'slug', 'title', 'media', 'type', 'initialReleaseScope']) {
      if (!(key in project)) throw new Error(`Project is missing required field "${key}".`);
    }
    if (typeof project.id !== 'string' || !project.id) throw new Error('Invalid Project ID.');
    if (typeof project.slug !== 'string' || !project.slug) throw new Error(`Invalid slug for ${project.id}.`);
    if (typeof project.initialReleaseScope !== 'boolean') {
      throw new Error(`Invalid initialReleaseScope for ${project.id}.`);
    }
    if (!Array.isArray(project.clientArtists)) {
      throw new Error(`Invalid clientArtists for ${project.id}.`);
    }
    if (ids.has(project.id)) throw new Error(`Duplicate Project ID "${project.id}".`);
    if (slugs.has(project.slug)) throw new Error(`Duplicate Project slug "${project.slug}".`);
    ids.add(project.id);
    slugs.add(project.slug);
  }

  const initial = selectInitialReleaseProjects(projects);
  const deferred = projects.filter((project) => !initial.includes(project));
  if (initial.length !== EXPECTED_INITIAL_RELEASE_COUNT) {
    throw new Error(
      `Initial-release Project count changed: expected ${EXPECTED_INITIAL_RELEASE_COUNT}, received ${initial.length}. Review release/deferred semantics before scanning.`,
    );
  }

  return {
    all: projects,
    initial: initial.map(toMatcherProject),
    deferred: deferred.map(toMatcherProject),
  };
}

export async function loadProjectCatalog() {
  const projects = JSON.parse(await readFile(PROJECTS_FILE, 'utf8'));
  return validateAndSplitProjects(projects);
}

export function toMatcherProject(project) {
  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    year: project.year,
    media: taxonomyText(project.media),
    type: taxonomyText(project.type),
    clientArtists: [...project.clientArtists],
  };
}
