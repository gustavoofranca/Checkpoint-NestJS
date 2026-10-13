import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCuratedAppIds } from './data-files';

describe('loadCuratedAppIds', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'checkpoint-app-ids-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function listFile(entries: unknown): Promise<string> {
    const file = join(dir, 'steam-app-ids.json');
    await writeFile(file, JSON.stringify(entries));
    return file;
  }

  it('reads the committed curated list', async () => {
    const ids = await loadCuratedAppIds();

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns the app ids in file order', async () => {
    const file = await listFile([
      { appId: 730, name: 'Counter-Strike 2' },
      { appId: 570, name: 'Dota 2' },
    ]);

    await expect(loadCuratedAppIds(file)).resolves.toEqual([730, 570]);
  });

  it('rejects a list with a duplicate app id', async () => {
    const file = await listFile([
      { appId: 730, name: 'Counter-Strike 2' },
      { appId: 730, name: 'Counter-Strike 2 again' },
    ]);

    await expect(loadCuratedAppIds(file)).rejects.toThrow('contains duplicate app ids');
  });

  it('rejects an entry whose app id is not a positive integer', async () => {
    const file = await listFile([{ appId: -1, name: 'Broken' }]);

    await expect(loadCuratedAppIds(file)).rejects.toThrow();
  });
});
