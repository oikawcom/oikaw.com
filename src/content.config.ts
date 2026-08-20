import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const mediaValues = ['Video', 'Image', 'Sculpture', 'Other Media'] as const;
const typeValues = [
  'Music Video',
  'Visualizer',
  'Promo',
  'Broadcast',
  'Cover Art',
  'Portrait',
  'Photo',
  'Logo',
  'Other Type',
] as const;
const roleValues = [
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
] as const;
const techniqueValues = [
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
] as const;

const filterableTaxonomyValue = <T extends readonly [string, ...string[]]>(
  values: T,
  { optionalFilterBucket = false } = {},
) =>
  z.union([
    z.enum(values),
    z.object({
      label: z.string().min(1),
      filterAs: optionalFilterBucket ? z.enum(values).optional() : z.enum(values),
    }),
  ]);

const imageAsset = z.object({
  src: z.string().min(1),
  alt: z.string().default(''),
  caption: z.string().optional(),
  aspectRatio: z.string().optional(),
});

const videoAsset = z.object({
  src: z.string().min(1),
  poster: z.string().optional(),
  caption: z.string().optional(),
  aspectRatio: z.string().optional(),
});

const projects = defineCollection({
  loader: file('src/data/projects.json'),
  schema: z.object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    year: z.number().int().min(1900).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
    media: filterableTaxonomyValue(mediaValues),
    type: filterableTaxonomyValue(typeValues),
    roles: z
      .array(filterableTaxonomyValue(roleValues, { optionalFilterBucket: true }))
      .default([]),
    techniques: z.array(filterableTaxonomyValue(techniqueValues)).default([]),
    context: z.enum(['Client', 'Personal']).optional(),
    scope: z.literal('solo-production').optional(),
    clientArtists: z.array(z.string().min(1)).default([]),
    seriesCollection: z.string().optional(),
    explicitRelatedProjects: z.array(z.string().min(1)).default([]),
    legacyPaths: z.array(z.string().startsWith('/')).min(1),
    initialReleaseScope: z.boolean(),
    publicationStatus: z.enum(['published', 'draft']).optional(),
    featured: z.boolean().default(false),
    priority: z.number().int().default(0),
    thumbnail: imageAsset.optional(),
    images: z.array(imageAsset).default([]),
    video: videoAsset.optional(),
    galleryColumns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    descriptionJa: z.string().optional(),
    descriptionEn: z.string().optional(),
    credits: z
      .array(
        z.object({
          label: z.string().min(1),
          name: z.string().min(1),
        }),
      )
      .default([]),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { projects };
