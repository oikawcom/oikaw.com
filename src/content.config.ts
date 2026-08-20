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
    media: z.enum(mediaValues),
    type: z.enum(typeValues),
    roles: z.array(z.enum(roleValues)).default([]),
    techniques: z.array(z.enum(techniqueValues)).default([]),
    context: z.enum(['Client', 'Personal']).optional(),
    scope: z.literal('solo-production').optional(),
    clientArtist: z.string().optional(),
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
