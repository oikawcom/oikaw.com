import { getCollection, type CollectionEntry } from 'astro:content';

export type ProjectEntry = CollectionEntry<'projects'>;

const expectedMigratedProjectCount = 77;
const expectedExplicitRelationPairs = 5;
const reservedRootSlugs = new Set(['contact']);

function validateProjects(projects: ProjectEntry[]): void {
  if (projects.length !== expectedMigratedProjectCount) {
    throw new Error(
      `Expected ${expectedMigratedProjectCount} migrated Projects, received ${projects.length}.`,
    );
  }

  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const project of projects) {
    const { id, slug } = project.data;

    if (project.id !== id) {
      throw new Error(
        `Collection entry ID "${project.id}" does not match Project ID "${id}".`,
      );
    }

    if (ids.has(id)) throw new Error(`Duplicate Project ID "${id}".`);
    if (slugs.has(slug)) throw new Error(`Duplicate Project slug "${slug}".`);
    if (reservedRootSlugs.has(slug)) {
      throw new Error(`Project slug "${slug}" conflicts with a static root route.`);
    }

    ids.add(id);
    slugs.add(slug);
  }

  const relationPairs = new Set<string>();

  for (const project of projects) {
    for (const relatedId of project.data.explicitRelatedProjects) {
      if (relatedId === project.data.id) {
        throw new Error(`Project "${project.data.id}" has a self-reference.`);
      }
      if (!ids.has(relatedId)) {
        throw new Error(
          `Project "${project.data.id}" references unknown Project "${relatedId}".`,
        );
      }

      const relatedProject = projects.find(({ data }) => data.id === relatedId);
      if (!relatedProject?.data.explicitRelatedProjects.includes(project.data.id)) {
        throw new Error(
          `Related Project link is not symmetric: "${project.data.id}" → "${relatedId}".`,
        );
      }

      relationPairs.add([project.data.id, relatedId].sort().join('|'));
    }
  }

  if (relationPairs.size !== expectedExplicitRelationPairs) {
    throw new Error(
      `Expected ${expectedExplicitRelationPairs} explicit Related Project pairs, received ${relationPairs.size}.`,
    );
  }
}

export async function getAllProjects(): Promise<ProjectEntry[]> {
  const projects = await getCollection('projects');
  validateProjects(projects);
  return projects;
}

export async function getPublishedProjects(): Promise<ProjectEntry[]> {
  const projects = (await getAllProjects()).filter(
    ({ data }) => data.initialReleaseScope && data.publicationStatus !== 'draft',
  );

  return projects.sort((a, b) => {
    if (a.data.featured !== b.data.featured) {
      return Number(b.data.featured) - Number(a.data.featured);
    }

    if (a.data.priority !== b.data.priority) {
      return b.data.priority - a.data.priority;
    }

    return a.data.slug.localeCompare(b.data.slug);
  });
}
