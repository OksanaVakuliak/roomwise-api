import { z } from 'zod';

export const imageRefSchema = z.object({
  id: z.uuid(),
  thumb: z.url(),
  card: z.url(),
  zoom: z.url(),
});

export const textureRefSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  previewUrl: z.url(),
  realSizeMm: z.number().int().positive().nullable(),
});

export type ImageRef = z.infer<typeof imageRefSchema>;
export type TextureRef = z.infer<typeof textureRefSchema>;
