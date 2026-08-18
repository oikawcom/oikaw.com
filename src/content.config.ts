import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const mediaItem = z.object({
  type: z.enum(['image', 'video', 'placeholder']),
  src: z.string().optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  aspectRatio: z.string().optional(),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/projects' }),
  schema: z.object({
    title: z.string().min(1),
    year: z.union([z.number().int(), z.string().min(1)]),
    context: z.enum(['Client', 'Personal']),
    types: z.array(z.string().min(1)).min(1),
    roles: z.array(z.string().min(1)).min(1),
    techniques: z.array(z.string().min(1)).default([]),
    clientArtist: z.string().optional(),
    series: z.string().optional(),
    featured: z.boolean().default(false),
    priority: z.number().int().default(0),
    thumbnail: z
      .object({
        src: z.string(),
        alt: z.string(),
        aspectRatio: z.string().optional(),
      })
      .optional(),
    media: z.array(mediaItem).default([]),
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
    legacyPaths: z.array(z.string()).default([]),
    draft: z.boolean(),
  }),
});

export const collections = { projects };
