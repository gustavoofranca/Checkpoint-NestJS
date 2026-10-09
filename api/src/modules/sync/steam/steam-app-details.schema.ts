import { z } from 'zod';

// The fields of Steam's store appdetails payload that the catalog reads. Unknown fields are
// dropped. Steam omits several fields for some apps, hence the optionals.
export const steamAppDataSchema = z.object({
  type: z.string(),
  name: z.string(),
  steam_appid: z.number().int().positive(),
  is_free: z.boolean(),
  short_description: z.string(),
  header_image: z.string(),
  release_date: z.object({ coming_soon: z.boolean(), date: z.string() }).optional(),
  developers: z.array(z.string()).optional(),
  publishers: z.array(z.string()).optional(),
  price_overview: z
    .object({ currency: z.string(), initial: z.number().int().nonnegative() })
    .optional(),
  genres: z.array(z.object({ description: z.string() })).optional(),
});

export type SteamAppData = z.infer<typeof steamAppDataSchema>;

// GET /api/appdetails?appids=<id> answers { "<id>": { success, data? } }.
export const steamAppDetailsResponseSchema = z.record(
  z.string(),
  z.object({ success: z.boolean(), data: z.unknown().optional() }),
);
