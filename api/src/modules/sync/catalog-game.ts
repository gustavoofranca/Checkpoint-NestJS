import { z } from 'zod';

// A game as the catalog stores it, after Steam data has been validated and cleaned. The bundled
// snapshot is a list of these, and the seed validates it again before writing.
export const catalogGameSchema = z.object({
  steamAppId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  shortDescription: z.string().max(1000),
  headerImageUrl: z.url({ protocol: /^https$/ }).max(500),
  releaseDate: z.iso.date().nullable(),
  developers: z.array(z.string().min(1).max(100)).max(10),
  publishers: z.array(z.string().min(1).max(100)).max(10),
  isFree: z.boolean(),
  priceCents: z.number().int().nonnegative().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  genres: z.array(z.string().min(1).max(60)).max(10),
});

export type CatalogGame = z.infer<typeof catalogGameSchema>;

export const catalogSnapshotSchema = z.object({
  fetchedAt: z.iso.datetime(),
  games: z.array(catalogGameSchema),
});

export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
