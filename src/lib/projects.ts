import { getCollection, type CollectionEntry } from 'astro:content';

export type ProjectEntry = CollectionEntry<'projects'>;

const reservedRootIds = new Set(['contact']);

export async function getPublishedProjects(): Promise<ProjectEntry[]> {
  const projects = await getCollection('projects', ({ data }) => !data.draft);

  for (const project of projects) {
    if (reservedRootIds.has(project.id)) {
      throw new Error(
        `Published project ID "${project.id}" conflicts with a static root route.`,
      );
    }
  }

  return projects.sort((a, b) => {
    if (a.data.featured !== b.data.featured) {
      return Number(b.data.featured) - Number(a.data.featured);
    }

    if (a.data.priority !== b.data.priority) {
      return b.data.priority - a.data.priority;
    }

    return a.id.localeCompare(b.id);
  });
}
