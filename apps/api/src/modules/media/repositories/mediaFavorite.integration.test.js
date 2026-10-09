import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { buildApp } from '../../../app/authenticatedApp.testUtils.js';
import { createMediaFavoriteModule, createMediaListModule } from '../index.js';

const id = 'a0000000-0000-4000-8000-000000000001';
const deletedId = 'a0000000-0000-4000-8000-000000000002';
const missingId = 'a0000000-0000-4000-8000-000000000003';
const mediaData = {
    type: 'IMAGE',
    originalFilename: 'photo.jpg',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    fileSize: 10n,
};

describe.skipIf(process.env.DATABASE_TESTS !== '1')('favorite mutations with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

    it('preserves the favorite row on repeats and updates the canonical media filter', async () => {
        await database.rollback(async (tx) => {
            await tx.media.create({ data: { id, ...mediaData } });
            const favorite = createMediaFavoriteModule({ client: tx }).service;
            const list = createMediaListModule({
                client: tx,
                storage: {},
                config: { maxLimit: 200, urlExpirySeconds: 900 },
            }).service;
            const app = buildApp({ logger: false, mediaFavoriteService: favorite, mediaListService: list });
            try {
                expect((await app.inject('/api/media?favorite=true')).json().items).toEqual([]);
                expect((await app.inject({ method: 'POST', url: `/api/media/${id}/favorite` })).statusCode).toBe(204);
                const row = await tx.favorite.findUnique({
                    where: { userId_mediaId: { userId: '00000000-0000-4000-8000-000000000001', mediaId: id } },
                });
                await favorite.add(id, undefined, undefined, { id: '00000000-0000-4000-8000-000000000001' });
                expect(
                    await tx.favorite.findUnique({
                        where: { userId_mediaId: { userId: '00000000-0000-4000-8000-000000000001', mediaId: id } },
                    }),
                ).toEqual(row);
                expect((await app.inject('/api/media?favorite=true')).json().items).toMatchObject([
                    { id, favorite: true },
                ]);
                expect((await app.inject('/api/media?favorite=false')).json().items).toEqual([]);
                expect((await app.inject({ method: 'DELETE', url: `/api/media/${id}/favorite` })).statusCode).toBe(204);
                await favorite.remove(id, undefined, undefined, { id: '00000000-0000-4000-8000-000000000001' });
                expect(await tx.favorite.count()).toBe(0);
                expect((await app.inject('/api/media?favorite=true')).json().items).toEqual([]);
                expect((await app.inject('/api/media?favorite=false')).json().items).toMatchObject([
                    { id, favorite: false },
                ]);
            } finally {
                await app.close();
            }
        });
    });

    it('rejects missing and soft-deleted media for both mutations without changing existing favorites', async () => {
        await database.rollback(async (tx) => {
            await tx.media.create({ data: { id: deletedId, ...mediaData, deletedAt: new Date() } });
            await tx.favorite.create({ data: { userId: '00000000-0000-4000-8000-000000000001', mediaId: deletedId } });
            const { service } = createMediaFavoriteModule({ client: tx });
            for (const mediaId of [missingId, deletedId]) {
                for (const operation of ['add', 'remove'])
                    await expect(
                        service[operation](mediaId, undefined, undefined, {
                            id: '00000000-0000-4000-8000-000000000001',
                        }),
                    ).rejects.toMatchObject({ statusCode: 404 });
            }
            expect(await tx.favorite.count()).toBe(1);
        });
    });

    it('serializes simultaneous mutations and prevents duplicate rows across real transactions', async () => {
        await database.withClient(async (client, schema) => {
            await client.media.create({ data: { id, ...mediaData } });
            const scopedClient = {
                $connect: () => client.$connect(),
                $transaction: (run, options) =>
                    client.$transaction(async (tx) => {
                        await tx.$queryRaw`SELECT set_config('search_path', ${schema}, true)`;
                        return run(tx);
                    }, options),
            };
            const { service } = createMediaFavoriteModule({ client: scopedClient });
            await Promise.all(
                Array.from({ length: 6 }, () =>
                    service.add(id, undefined, undefined, { id: '00000000-0000-4000-8000-000000000001' }),
                ),
            );
            expect(await client.favorite.count({ where: { mediaId: id } })).toBe(1);
            await expect(
                client.favorite.create({ data: { userId: '00000000-0000-4000-8000-000000000001', mediaId: id } }),
            ).rejects.toMatchObject({ code: 'P2002' });
            await Promise.all([
                service.remove(id, undefined, undefined, { id: '00000000-0000-4000-8000-000000000001' }),
                service.add(id, undefined, undefined, { id: '00000000-0000-4000-8000-000000000001' }),
            ]);
            expect(await client.favorite.count({ where: { mediaId: id } })).toBeLessThanOrEqual(1);
            await Promise.all(
                Array.from({ length: 6 }, () =>
                    service.remove(id, undefined, undefined, { id: '00000000-0000-4000-8000-000000000001' }),
                ),
            );
            expect(await client.favorite.count({ where: { mediaId: id } })).toBe(0);
        });
    });
});
