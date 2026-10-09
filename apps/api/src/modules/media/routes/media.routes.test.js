import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app/authenticatedApp.testUtils.js';

const id = 'a0000000-0000-4000-8000-000000000001';
const nextId = 'a0000000-0000-4000-8000-000000000002';
const timestamp = new Date('2026-10-01T12:00:00.000Z');
const row = {
    id,
    type: 'IMAGE',
    originalFilename: 'photo.jpg',
    width: 4000,
    height: 3000,
    aspectRatio: 4 / 3,
    favorites: [{ id }],
    takenAt: timestamp,
    createdAt: timestamp,
    variants: [
        {
            id,
            type: 'THUMBNAIL',
            name: 'thumbnail-200',
            format: 'webp',
            width: 200,
            height: 150,
            storageKey: `media/${id}/thumb.webp`,
        },
    ],
};

describe('GET /api/media', () => {
    let app;
    afterEach(async () => app?.close());

    function setup(rows = [], maxLimit = 200) {
        const findMany = vi.fn().mockResolvedValue(rows);
        const storage = {
            close: vi.fn(),
            createPresignedDownloadUrl: vi.fn(async ({ key }) => ({ url: `https://assets.example/${key}` })),
        };
        app = buildApp({
            logger: false,
            database: { client: { media: { findMany } }, connect: vi.fn(), disconnect: vi.fn() },
            storage,
            mediaListConfig: { maxLimit, urlExpirySeconds: 900 },
        });
        return { findMany, storage };
    }

    it('returns an empty page using the default bounded query', async () => {
        const { findMany } = setup();
        const response = await app.inject('/api/media');
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ items: [], nextCursor: null, hasMore: false });
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 51,
                where: { deletedAt: null },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            }),
        );
    });

    it('fetches one extra row and encodes every ordering value from the last returned item', async () => {
        const { findMany, storage } = setup([row, { ...row, id: nextId }]);
        const response = await app.inject('/api/media?limit=1');
        expect(response.statusCode).toBe(200);
        const page = response.json();
        expect(page.items).toHaveLength(1);
        expect(page.hasMore).toBe(true);
        expect(JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString())).toEqual({
            v: 1,
            sort: 'createdAt',
            order: 'desc',
            value: timestamp.toISOString(),
            id,
        });
        expect(findMany.mock.calls[0][0].take).toBe(2);
        expect(storage.createPresignedDownloadUrl).toHaveBeenCalledTimes(1);
        await app.inject(`/api/media?limit=1&cursor=${page.nextCursor}`);
        expect(findMany.mock.calls[1][0].where).toEqual({
            deletedAt: null,
            AND: [{ OR: [{ createdAt: { lt: timestamp } }, { createdAt: timestamp, id: { lt: id } }] }],
        });
    });

    it('projects only gallery fields and selects only thumbnail data from Prisma', async () => {
        const { findMany, storage } = setup([row]);
        const response = await app.inject('/api/media');
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            items: [
                {
                    id,
                    type: 'IMAGE',
                    originalFilename: 'photo.jpg',
                    width: 4000,
                    height: 3000,
                    aspectRatio: 4 / 3,
                    favorite: true,
                    takenAt: timestamp.toISOString(),
                    thumbnails: [
                        {
                            name: 'thumbnail-200',
                            format: 'webp',
                            width: 200,
                            height: 150,
                            url: `https://assets.example/media/${id}/thumb.webp`,
                        },
                    ],
                },
            ],
            nextCursor: null,
            hasMore: false,
        });
        const { select } = findMany.mock.calls[0][0];
        expect(Object.keys(select).sort()).toEqual(
            [
                'id',
                'type',
                'originalFilename',
                'width',
                'height',
                'aspectRatio',
                'favorites',
                'takenAt',
                'createdAt',
                'variants',
            ].sort(),
        );
        expect(select.variants.where).toEqual({ type: 'THUMBNAIL' });
        expect(select.variants.select).not.toHaveProperty('fileSize');
        expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith({
            key: `media/${id}/thumb.webp`,
            expiresIn: 900,
        });
    });

    it('combines scalar, relation, and inclusive date filters', async () => {
        const { findMany } = setup();
        const params = new URLSearchParams({
            type: 'VIDEO',
            status: 'READY',
            favorite: 'false',
            category: id,
            tag: id,
            album: id,
            mimeType: 'video/mp4',
            takenAtFrom: '2026-01-01T00:00:00Z',
            takenAtTo: '2026-02-01T00:00:00Z',
            createdAtFrom: '2026-03-01T00:00:00Z',
            createdAtTo: '2026-04-01T00:00:00Z',
        });
        expect((await app.inject(`/api/media?${params}`)).statusCode).toBe(200);
        expect(findMany.mock.calls[0][0].where).toEqual({
            deletedAt: null,
            type: 'VIDEO',
            status: 'READY',
            favorites: { none: { userId: '00000000-0000-4000-8000-000000000001' } },
            categories: { some: { categoryId: id } },
            tags: { some: { tagId: id } },
            albums: { some: { albumId: id, album: { deletedAt: null } } },
            mimeType: 'video/mp4',
            takenAt: { gte: new Date('2026-01-01'), lte: new Date('2026-02-01') },
            createdAt: { gte: new Date('2026-03-01'), lte: new Date('2026-04-01') },
        });
    });

    it('searches filename and taxonomy/album text case-insensitively alongside favorite', async () => {
        const { findMany } = setup();
        expect((await app.inject('/api/media?q=Beach&favorite=true')).statusCode).toBe(200);
        const where = findMany.mock.calls[0][0].where;
        expect(where.favorites).toEqual({ some: { userId: '00000000-0000-4000-8000-000000000001' } });
        expect(where.AND[0].OR).toContainEqual({ originalFilename: { contains: 'Beach', mode: 'insensitive' } });
        expect(where.AND[0].OR).toContainEqual({
            tags: { some: { tag: { name: { contains: 'Beach', mode: 'insensitive' } } } },
        });
    });

    it.each(['createdAt', 'takenAt', 'filename'])('binds cursors to %s and supports ascending order', async (sort) => {
        const { findMany } = setup([row, { ...row, id: nextId }]);
        const page = (await app.inject(`/api/media?limit=1&sort=${sort}&order=asc`)).json();
        expect(page.hasMore).toBe(true);
        expect(JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString())).toMatchObject({
            sort,
            order: 'asc',
            id,
        });
        expect((await app.inject(`/api/media?sort=${sort}&order=asc&cursor=${page.nextCursor}`)).statusCode).toBe(200);
        expect(findMany.mock.calls[1][0].orderBy).toEqual([
            {
                [sort === 'filename' ? 'originalFilename' : sort]:
                    sort === 'takenAt' ? { sort: 'asc', nulls: 'last' } : 'asc',
            },
            { id: 'asc' },
        ]);
        expect((await app.inject(`/api/media?sort=${sort}&order=desc&cursor=${page.nextCursor}`)).statusCode).toBe(400);
    });

    it('paginates the null takenAt tail using id alone', async () => {
        const { findMany } = setup([
            { ...row, takenAt: null },
            { ...row, id: nextId, takenAt: null },
        ]);
        const page = (await app.inject('/api/media?sort=takenAt&limit=1')).json();
        expect(page.hasMore).toBe(true);
        expect((await app.inject(`/api/media?sort=takenAt&cursor=${page.nextCursor}`)).statusCode).toBe(200);
        expect(findMany.mock.calls[1][0].where.AND).toEqual([{ takenAt: null, id: { lt: id } }]);
    });

    it.each([
        { v: 2, sort: 'createdAt', order: 'desc', value: timestamp.toISOString(), id },
        { v: 1, sort: 'filename', order: 'desc', value: 'photo.jpg', id },
        { v: 1, sort: 'createdAt', order: 'desc', value: null, id },
        { v: 1, sort: 'createdAt', order: 'desc', value: '2026-02-30T00:00:00.000Z', id },
        { v: 1, sort: 'createdAt', order: 'desc', value: timestamp.toISOString(), id: 'bad' },
        { v: 1, sort: 'createdAt', order: 'desc', id },
        { v: 1, sort: 'createdAt', order: 'desc', value: timestamp.toISOString(), id, extra: true },
    ])('rejects incompatible or malformed cursor contents %j', async (contents) => {
        const { findMany } = setup();
        const cursor = Buffer.from(JSON.stringify(contents)).toString('base64url');
        expect((await app.inject(`/api/media?cursor=${cursor}`)).statusCode).toBe(400);
        expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects control characters in filename cursors before database access', async () => {
        const { findMany } = setup();
        const cursor = Buffer.from(
            JSON.stringify({ v: 1, sort: 'filename', order: 'desc', value: 'bad\u0000.jpg', id }),
        ).toString('base64url');
        expect((await app.inject(`/api/media?sort=filename&cursor=${cursor}`)).statusCode).toBe(400);
        expect(findMany).not.toHaveBeenCalled();
    });

    it.each([
        'limit=0',
        'limit=201',
        'limit=1.5',
        'limit=1e2',
        'limit=',
        'favorite=0',
        'favorite=TRUE',
        'sort=checksum',
        'order=sideways',
        'type=OTHER',
        'status=OTHER',
        'tag=bad',
        'album=bad',
        'category=bad',
        'mimeType=bad',
        'takenAtFrom=bad',
        'createdAtTo=2026-02-30T00:00:00Z',
        'takenAtFrom=2026-02-01T00:00:00Z&takenAtTo=2026-01-01T00:00:00Z',
        'q=',
        'type=IMAGE&type=VIDEO',
        'unknown=value',
        'cursor=bad',
        'cursor=',
    ])('rejects invalid query %s before database access', async (query) => {
        const { findMany } = setup();
        expect((await app.inject(`/api/media?${query}`)).statusCode).toBe(400);
        expect(findMany).not.toHaveBeenCalled();
    });

    it('enforces a configured maximum and clamps the default when the maximum is below 50', async () => {
        const { findMany } = setup([], 20);
        expect((await app.inject('/api/media?limit=21')).statusCode).toBe(400);
        expect((await app.inject('/api/media')).statusCode).toBe(200);
        expect(findMany.mock.calls[0][0].take).toBe(21);
    });

    it.each([1025, 4000])('roundtrips emitted filename cursors with %s-byte domain filenames', async (length) => {
        const originalFilename = 'a'.repeat(length);
        const { findMany } = setup([
            { ...row, originalFilename },
            { ...row, id: nextId, originalFilename },
        ]);
        const first = await app.inject('/api/media?sort=filename&limit=1');
        expect(first.statusCode).toBe(200);
        const next = await app.inject(`/api/media?sort=filename&cursor=${first.json().nextCursor}`);
        expect(next.statusCode).toBe(200);
        expect(findMany.mock.calls[1][0].where.AND[0].OR[1]).toEqual({ originalFilename, id: { lt: id } });
    });

    it('maps storage errors through centralized handling without exposing private details', async () => {
        const { storage } = setup([row]);
        storage.createPresignedDownloadUrl.mockRejectedValue(new Error('secret-storage-key'));
        const response = await app.inject('/api/media');
        expect(response.statusCode).toBe(500);
        expect(response.body).not.toContain('secret-storage-key');
    });
});
