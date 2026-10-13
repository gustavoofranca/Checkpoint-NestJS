import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LibraryStatus } from '../src/generated/prisma/client';
import { registerAndLogin, type Signed } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createGame, createTestPrismaClient, resetDatabase } from './support/database';
import { liveDependencies, testConfig } from './support/test-config';

const entrySchema = z.object({
  game: z.object({ id: z.uuid(), slug: z.string() }),
  status: z.enum(LibraryStatus),
});
const pageSchema = z.object({ data: z.array(entrySchema), nextCursor: z.string().nullable() });

describe('library', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;
  let games: string[];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ config: testConfig(liveDependencies()) });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    games = [];
    for (const slug of ['hades', 'celeste', 'hollow-knight']) {
      games.push((await createGame(prisma, { slug })).id);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const gameAt = (index: number): string => {
    const id = games[index];
    if (id === undefined) {
      throw new Error(`no game at ${String(index)}`);
    }
    return id;
  };
  const auth = (user: Signed) => `Bearer ${user.accessToken}`;
  const setStatus = (user: Signed, gameId: string, status: unknown) =>
    http().put(`/api/v1/me/library/${gameId}`).set('Authorization', auth(user)).send({ status });
  const list = async (user: Signed, query: Record<string, string | number> = {}) =>
    pageSchema.parse(
      (
        await http()
          .get('/api/v1/me/library')
          .set('Authorization', auth(user))
          .query(query)
          .expect(200)
      ).body,
    );

  it('adds a game, changes its status and removes it', async () => {
    const ana = await registerAndLogin(app);

    await setStatus(ana, gameAt(0), LibraryStatus.BACKLOG).expect(200);
    const updated = await setStatus(ana, gameAt(0), LibraryStatus.PLAYING).expect(200);
    expect(entrySchema.parse(updated.body)).toMatchObject({
      status: LibraryStatus.PLAYING,
      game: { slug: 'hades' },
    });
    expect((await list(ana)).data).toHaveLength(1);

    await http()
      .delete(`/api/v1/me/library/${gameAt(0)}`)
      .set('Authorization', auth(ana))
      .expect(204);
    expect((await list(ana)).data).toEqual([]);
  });

  it('lists the most recently changed first, filters by status and pages through every entry once', async () => {
    const ana = await registerAndLogin(app);
    await setStatus(ana, gameAt(0), LibraryStatus.COMPLETED).expect(200);
    await setStatus(ana, gameAt(1), LibraryStatus.PLAYING).expect(200);
    await setStatus(ana, gameAt(2), LibraryStatus.COMPLETED).expect(200);

    const first = await list(ana, { limit: 2 });
    const second = await list(ana, { limit: 2, cursor: first.nextCursor ?? '' });
    expect([...first.data, ...second.data].map((entry) => entry.game.slug)).toEqual([
      'hollow-knight',
      'celeste',
      'hades',
    ]);
    expect(second.nextCursor).toBeNull();

    const completed = await list(ana, { status: LibraryStatus.COMPLETED });
    expect(completed.data.map((entry) => entry.game.slug)).toEqual(['hollow-knight', 'hades']);
  });

  it.each([
    ['an unknown status', 'FINISHED'],
    ['no status', undefined],
  ])('rejects %s with 400', async (_, status) => {
    const ana = await registerAndLogin(app);

    await setStatus(ana, gameAt(0), status).expect(400);
  });

  it('rejects a body that names a user', async () => {
    const ana = await registerAndLogin(app);

    await http()
      .put(`/api/v1/me/library/${gameAt(0)}`)
      .set('Authorization', auth(ana))
      .send({ status: LibraryStatus.BACKLOG, userId: randomUUID() })
      .expect(400);
  });

  it('answers 400 for a game id that is not a UUID and 404 for an unknown one', async () => {
    const ana = await registerAndLogin(app);

    await setStatus(ana, 'hades', LibraryStatus.BACKLOG).expect(400);
    await setStatus(ana, randomUUID(), LibraryStatus.BACKLOG).expect(404);
    await http()
      .delete(`/api/v1/me/library/${gameAt(1)}`)
      .set('Authorization', auth(ana))
      .expect(404);
  });

  it('rejects a status filter that is not a status', async () => {
    const ana = await registerAndLogin(app);

    await http()
      .get('/api/v1/me/library')
      .set('Authorization', auth(ana))
      .query({ status: 'ALL' })
      .expect(400);
  });

  describe('one user cannot see or change another user’s library', () => {
    it('lists only the caller’s entries', async () => {
      const [ana, bruno] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
      await setStatus(bruno, gameAt(0), LibraryStatus.PLAYING).expect(200);

      expect((await list(ana)).data).toEqual([]);
    });

    it('removing a game from "my" library leaves another user’s entry in place', async () => {
      const [ana, bruno] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
      await setStatus(bruno, gameAt(0), LibraryStatus.PLAYING).expect(200);

      await http()
        .delete(`/api/v1/me/library/${gameAt(0)}`)
        .set('Authorization', auth(ana))
        .expect(404);

      expect(await prisma.libraryEntry.count()).toBe(1);
    });

    it('setting a status writes the caller’s entry and leaves the other one unchanged', async () => {
      const [ana, bruno] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
      await setStatus(bruno, gameAt(0), LibraryStatus.PLAYING).expect(200);

      await setStatus(ana, gameAt(0), LibraryStatus.DROPPED).expect(200);

      expect((await list(bruno)).data.map((entry) => entry.status)).toEqual([
        LibraryStatus.PLAYING,
      ]);
      expect((await list(ana)).data.map((entry) => entry.status)).toEqual([LibraryStatus.DROPPED]);
    });
  });
});
