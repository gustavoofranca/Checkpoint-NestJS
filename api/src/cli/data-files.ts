import { join } from 'node:path';

// Resolved from this file, so the CLIs find the data from src/ under tests and from dist/ when
// built: both sit two levels below api/.
const DATA_DIR = join(__dirname, '..', '..', 'prisma', 'data');

export const APP_IDS_FILE = join(DATA_DIR, 'steam-app-ids.json');
export const SNAPSHOT_FILE = join(DATA_DIR, 'steam-snapshot.json');
