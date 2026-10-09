import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { buildApp } from '../../../app/app.js';
import { createDashboardModule } from '../index.js';

describe.skipIf(process.env.DATABASE_TESTS !== '1')('dashboard with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

    it('returns zero counts and byte totals for an empty library', async () => {
        await database.rollback(async (client) => {
            const { service } = createDashboardModule({ client });
            expect(await service.summary()).toMatchObject({
                counts: { media: 0, albums: 0, categories: 0, tags: 0, processingMedia: 0, failedMedia: 0 },
                storage: { originalBytes: '0', optimizedBytes: '0', estimatedSavedBytes: '0' },
                recentAlbums: [],
                recentMedia: [],
            });
        });
    });

    it('aggregates active rows once per media, sums all optimized variants, and bounds recent lists', async () => {
        await database.rollback(async (client) => {
            const date = new Date('2026-10-01T00:00:00Z');
            const ids = Array.from(
                { length: 8 },
                (_, n) => `b0000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`,
            );
            for (const [index, id] of ids.entries()) {
                await client.media.create({
                    data: {
                        id,
                        type: 'IMAGE',
                        originalFilename: 'photo.jpg',
                        mimeType: 'image/jpeg',
                        extension: 'jpg',
                        fileSize: index === 0 ? 9007199254740993n : 1000n,
                        status: index === 1 ? 'PROCESSING' : index >= 6 ? 'FAILED' : 'PENDING',
                        createdAt: date,
                        ...(index === 7 ? { deletedAt: date } : {}),
                    },
                });
                await client.album.create({
                    data: {
                        id,
                        name: `Album ${index}`,
                        slug: `album-${index}`,
                        createdAt: date,
                        ...(index === 7 ? { deletedAt: date } : {}),
                    },
                });
            }
            await client.category.create({ data: { name: 'Travel', slug: 'travel' } });
            await client.tag.create({ data: { name: 'Beach', slug: 'beach' } });
            for (const [mediaId, type, name, size] of [
                [ids[0], 'OPTIMIZED', 'webp', 200n],
                [ids[0], 'OPTIMIZED', 'avif', 300n],
                [ids[1], 'OPTIMIZED', 'large', 1200n],
                [ids[7], 'OPTIMIZED', 'deleted', 50n],
                [ids[0], 'ORIGINAL', 'original', 9007199254740993n],
                [ids[0], 'THUMBNAIL', 'thumb', 10n],
            ])
                await client.mediaVariant.create({
                    data: { mediaId, type, name, fileSize: size, format: 'webp', storageKey: `${mediaId}/${name}` },
                });
            const app = buildApp({
                logger: false,
                database: { client, connect: async () => {}, disconnect: async () => {} },
            });
            try {
                const response = await app.inject('/api/dashboard');
                expect(response.statusCode).toBe(200);
                const result = response.json();
                expect(result.counts).toEqual({
                    media: 7,
                    albums: 7,
                    categories: 1,
                    tags: 1,
                    processingMedia: 1,
                    failedMedia: 1,
                });
                expect(result.storage).toEqual({
                    originalBytes: '9007199254746993',
                    optimizedBytes: '1700',
                    estimatedSavedBytes: '9007199254740493',
                });
                expect(result.recentMedia.map((row) => row.id)).toEqual(ids.slice(2, 7).reverse());
                expect(result.recentAlbums.map((row) => row.id)).toEqual(ids.slice(2, 7).reverse());
                expect(result.recentMedia[0]).not.toHaveProperty('storageKey');
            } finally {
                await app.close();
            }
        });
    });
});
