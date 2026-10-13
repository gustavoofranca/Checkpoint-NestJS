import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

// Resolved from this file: src/modules/sync under tests and dist/modules/sync when built both sit
// three levels below api/, where prisma/data lives.
const DATA_DIR = join(__dirname, '..', '..', '..', 'prisma', 'data');

export const APP_IDS_FILE = join(DATA_DIR, 'steam-app-ids.json');
export const SNAPSHOT_FILE = join(DATA_DIR, 'steam-snapshot.json');

// `name` is only there so a reviewer can read the list; Steam's title is what gets stored.
const appIdListSchema = z.array(z.object({ appId: z.number().int().positive(), name: z.string() }));

// The curated list of games the catalog follows (docs/adr/0009). Never the full Steam app list.
export async function loadCuratedAppIds(file = APP_IDS_FILE): Promise<number[]> {
  const ids = appIdListSchema
    .parse(JSON.parse(await readFile(file, 'utf8')))
    .map((entry) => entry.appId);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${file} contains duplicate app ids`);
  }
  return ids;
}
