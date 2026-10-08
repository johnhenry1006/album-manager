import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { buildApp } from '../../../app/app.js';

const mediaId = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const album = 'b0000000-0000-4000-8000-000000000001';
const category = 'b0000000-0000-4000-8000-000000000002';
const tag = 'b0000000-0000-4000-8000-000000000003';
const createdAt = new Date('2026-01-01T00:00:00Z');
const takenAt = new Date('2025-01-01T00:00:00Z');
const filters = {
    q: 'bEaCh',
    album,
    category,
    tag,
    takenAtFrom: '2025-01-01T00:00:00Z',
    takenAtTo: '2025-01-01T00:00:00Z',
    createdAtFrom: '2026-01-01T00:00:00Z',
    createdAtTo: '2026-01-01T00:00:00Z',
    type: 'IMAGE',
    mimeType: 'image/jpeg',
    favorite: 'true',
    status: 'READY',
};

describe.skipIf(process.env.DATABASE_TESTS !== '1')('GET /api/media combined filters with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

    async function fixture(run) {
        await database.rollback(async (tx) => {
            await tx.album.create({
                data: { id: album, name: 'Holiday', slug: 'holiday', description: 'Summer trip' },
            });
            await tx.category.create({ data: { id: category, name: 'Travel', slug: 'travel' } });
            await tx.tag.create({ data: { id: tag, name: 'Ocean', slug: 'ocean' } });
            // Three matches, then rows which each violate exactly one predicate.
            const patches = [
                {},
                {},
                {},
                { originalFilename: 'other.jpg' },
                { albums: undefined },
                { categories: undefined },
                { tags: undefined },
                { takenAt: new Date('2024-12-31T23:59:59.999Z') },
                { takenAt: new Date('2025-01-01T00:00:00.001Z') },
                { takenAt: null },
                { createdAt: new Date('2025-12-31T23:59:59.999Z') },
                { createdAt: new Date('2026-01-01T00:00:00.001Z') },
                { type: 'VIDEO' },
                { mimeType: 'image/png' },
                { favorite: undefined },
                { status: 'FAILED' },
                { deletedAt: createdAt },
            ];
            for (const [index, patch] of patches.entries()) {
                await tx.media.create({
                    data: {
                        id: mediaId(index + 1),
                        originalFilename: 'Beach.jpg',
                        extension: 'jpg',
                        fileSize: 100n,
                        type: 'IMAGE',
                        mimeType: 'image/jpeg',
                        status: 'READY',
                        createdAt,
                        takenAt,
                        albums: { create: { albumId: album } },
                        categories: { create: { categoryId: category } },
                        tags: { create: { tagId: tag } },
                        favorite: { create: {} },
                        ...patch,
                    },
                });
            }
            const app = buildApp({
                logger: false,
                database: { client: tx, connect: async () => {}, disconnect: async () => {} },
                storage: {
                    close: async () => {},
                    createPresignedDownloadUrl: async ({ key }) => ({ url: `https://assets.example/${key}` }),
                },
                mediaListConfig: { maxLimit: 200, urlExpirySeconds: 900 },
            });
            try {
                await run(tx, app);
            } finally {
                await app.close();
            }
        });
    }

    async function getPage(app, query) {
        const response = await app.inject(`/api/media?${new URLSearchParams(query)}`);
        expect(response.statusCode).toBe(200);
        return response.json();
    }

    async function walk(app, query, expected) {
        const seen = [];
        let cursor;
        // Bound the walk so a repeated cursor fails instead of hanging the suite.
        for (let pageNumber = 0; pageNumber <= expected.length; pageNumber++) {
            const page = await getPage(app, { ...query, ...(cursor ? { cursor } : {}) });
            seen.push(...page.items.map((item) => item.id));
            expect(page.items.length).toBeLessThanOrEqual(Number(query.limit));
            expect(page.hasMore).toBe(seen.length < expected.length);
            if (!page.hasMore) {
                expect(page.nextCursor).toBeNull();
                break;
            }
            expect(page.nextCursor).toBeTypeOf('string');
            expect(page.nextCursor).not.toBe(cursor);
            cursor = page.nextCursor;
        }
        expect(seen).toEqual(expected);
    }

    it.each([
        ['createdAt', 'asc', [1, 2, 3]],
        ['createdAt', 'desc', [3, 2, 1]],
        ['takenAt', 'asc', [1, 2, 3]],
        ['takenAt', 'desc', [3, 2, 1]],
        ['filename', 'asc', [1, 2, 3]],
        ['filename', 'desc', [3, 2, 1]],
    ])('intersects every filter while paginating tied %s %s values', async (sort, order, expected) => {
        await fixture(async (_tx, app) => {
            for (const limit of ['1', '2', '3', '10']) {
                await walk(app, { ...filters, sort, order, limit }, expected.map(mediaId));
            }
        });
    });

    it.each(['oCeAn', 'tRaVeL', 'hOlIdAy', 'sUmMeR'])(
        'combines related text search %s with filters and cursors',
        async (q) => {
            await fixture(async (_tx, app) => {
                await walk(app, { ...filters, q, order: 'asc', limit: '1' }, [1, 2, 3, 4].map(mediaId));
            });
        },
    );

    it.each([
        ['asc', [8, 1, 2, 3, 9, 10]],
        ['desc', [9, 3, 2, 1, 8, 10]],
    ])('keeps null taken dates last with combined filters in %s order', async (order, expected) => {
        await fixture(async (_tx, app) => {
            const { takenAtFrom: _from, takenAtTo: _to, ...query } = filters;
            await walk(app, { ...query, sort: 'takenAt', order, limit: '1' }, expected.map(mediaId));
        });
    });

    it('continues a filtered page after its cursor anchor is deleted', async () => {
        await fixture(async (tx, app) => {
            const first = await getPage(app, { ...filters, limit: '1' });
            expect(first.items.map((item) => item.id)).toEqual([mediaId(3)]);
            expect(first.hasMore).toBe(true);
            await tx.media.delete({ where: { id: mediaId(3) } });
            await walk(app, { ...filters, limit: '1', cursor: first.nextCursor }, [2, 1].map(mediaId));
        });
    });

    it('excludes memberships of a deleted album even when other filters match', async () => {
        await fixture(async (tx, app) => {
            await tx.album.update({ where: { id: album }, data: { deletedAt: createdAt } });
            await walk(app, { ...filters, limit: '1' }, []);
        });
    });
});
