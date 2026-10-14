import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { envSchema } from '../src/config/env.schema';

// Repository rules a review could miss (docs/SECURITY.md sections 7 and 8).
const ROOT = join(__dirname, '..', '..');

const read = (path: string) => readFile(join(ROOT, path), 'utf8');

function variablesIn(text: string, pattern: RegExp): Set<string> {
  return new Set([...text.matchAll(pattern)].map((match) => match[1] ?? ''));
}

describe('.env.example', () => {
  it('documents every variable read by the API, the CLIs and the compose files, and no other', async () => {
    const compose = (await read('docker-compose.yml')) + (await read('docker-compose.prod.yml'));
    const readByCode = [
      ...Object.keys(envSchema.shape),
      // Read by the seed CLI only (src/config/cli-config.ts).
      'SEED_DEMO_PASSWORD',
      ...variablesIn(compose, /\$\{([A-Z][A-Z0-9_]*)/g),
    ];

    const documented = variablesIn(await read('.env.example'), /^([A-Z][A-Z0-9_]*)=/gm);

    expect([...documented].sort()).toEqual([...new Set(readByCode)].sort());
  });
});

describe('dependencies', () => {
  it('pins every npm dependency to an exact version', async () => {
    const manifest = z
      .object({
        dependencies: z.record(z.string(), z.string()),
        devDependencies: z.record(z.string(), z.string()),
      })
      .parse(JSON.parse(await read('api/package.json')));
    const versions = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies });

    for (const [name, version] of versions) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('pins every GitHub Action to a commit SHA', async () => {
    const files = await readdir(join(ROOT, '.github', 'workflows'));
    const uses = (
      await Promise.all(files.map((file) => read(join('.github', 'workflows', file))))
    ).flatMap((text) => [...text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map((m) => m[1] ?? ''));

    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});
