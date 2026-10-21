import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { ROLE_KEYS } from './lib/gallery';

const credits = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/galleries' }),
  schema: z.object({
    frames: z
      .array(
        z.object({
          file: z.string(),
          title: z.string().optional(),
          client: z.string().optional(),
          roles: z.array(z.enum(ROLE_KEYS)).optional(),
          film: z.string().url().optional(),
          alt: z.string().optional(),
          cover: z.boolean().optional(),
        })
      )
      .default([]),
  }),
});

export const collections = { credits };
