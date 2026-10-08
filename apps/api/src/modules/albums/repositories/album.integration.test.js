import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { buildApp } from '../../../app/app.js';
import { createAlbumModule } from '../index.js';

const mediaIds = [1, 2, 3, 4].map((n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const storage = { createPresignedDownloadUrl: async ({ key }) => ({ url: `https://assets.example/${key}` }) };

describe.skipIf(process.env.DATABASE_TESTS !== '1')('albums with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());
    async function fixture(run) {
        await database.rollback(async (tx) => {
            for (const [index, id] of mediaIds.entries())
                await tx.media.create({
                    data: {
                        id,
                        type: index === 1 ? 'VIDEO' : 'IMAGE',
                        originalFilename: 'photo.jpg',
                        mimeType: 'image/jpeg',
                        extension: 'jpg',
                        fileSize: 10n,
                        ...(index === 3 ? { deletedAt: new Date() } : {}),
                    },
                });
            const { service } = createAlbumModule({ client: tx, storage });
            await run(tx, service);
        });
    }

    it('runs all eight HTTP routes and preserves shared media on album deletion', async () => {
        await fixture(async (tx, service) => {
            const app = buildApp({ logger: false, albumService: service });
            try {
                const created = await app.inject({
                    method: 'POST',
                    url: '/api/albums',
                    payload: { name: 'Trip', slug: 'trip' },
                });
                expect(created.statusCode).toBe(201);
                const album = created.json();
                const second = await service.create({ name: 'Other' });
                expect((await app.inject('/api/albums?q=TRIP')).json()).toMatchObject({
                    items: [{ id: album.id }],
                    pagination: { total: 1 },
                });
                for (const mediaId of mediaIds.slice(0, 2))
                    expect(
                        (
                            await app.inject({
                                method: 'POST',
                                url: `/api/albums/${album.id}/media`,
                                payload: { mediaId },
                            })
                        ).statusCode,
                    ).toBe(200);
                await service.addMedia(second.id, { mediaId: mediaIds[0] });
                expect(
                    (
                        await app.inject({
                            method: 'PATCH',
                            url: `/api/albums/${album.id}`,
                            payload: { coverMediaId: mediaIds[0] },
                        })
                    ).json(),
                ).toMatchObject({ coverMediaId: mediaIds[0] });
                expect((await app.inject(`/api/albums/${album.id}`)).json()).toMatchObject({
                    counts: { media: 2, images: 1, videos: 1 },
                });
                expect((await app.inject(`/api/albums/${album.id}/media`)).json().items.map((row) => row.id)).toEqual(
                    mediaIds.slice(0, 2),
                );
                expect(
                    (await app.inject({ method: 'DELETE', url: `/api/albums/${album.id}/media/${mediaIds[0]}` }))
                        .statusCode,
                ).toBe(204);
                expect(await service.detail(album.id)).toMatchObject({ coverMediaId: null });
                expect((await app.inject({ method: 'DELETE', url: `/api/albums/${album.id}` })).statusCode).toBe(204);
                expect((await app.inject(`/api/albums/${album.id}`)).statusCode).toBe(404);
                expect(await tx.media.count()).toBe(4);
                expect(await tx.albumMedia.count({ where: { albumId: album.id } })).toBe(1);
                expect((await service.listMedia(second.id, {})).items.map((row) => row.id)).toEqual([mediaIds[0]]);
            } finally {
                await app.close();
            }
        });
    });

    it('walks tied positions and compares cursor values after deleting its anchor', async () => {
        await fixture(async (_tx, service) => {
            const album = await service.create({ name: 'Ordered' });
            for (const mediaId of mediaIds.slice(0, 3)) await service.addMedia(album.id, { mediaId, position: 5 });
            const all = (await service.listMedia(album.id, {})).items;
            let cursor;
            const seen = [];
            do {
                const page = await service.listMedia(album.id, { limit: '1', ...(cursor ? { cursor } : {}) });
                seen.push(...page.items.map((row) => row.id));
                cursor = page.nextCursor;
            } while (cursor);
            expect(seen).toEqual(all.map((row) => row.id));
            const first = await service.listMedia(album.id, { limit: '1' });
            await service.removeMedia(album.id, first.items[0].id);
            expect(
                (await service.listMedia(album.id, { cursor: first.nextCursor })).items.map((row) => row.id),
            ).toEqual(all.slice(1).map((row) => row.id));
        });
    });

    it('appends after highest position, retains duplicate positions and reorders explicit membership', async () => {
        await fixture(async (tx, service) => {
            const album = await service.create({ name: 'Position' });
            const member = await service.addMedia(album.id, { mediaId: mediaIds[0], position: 12 });
            expect(await service.addMedia(album.id, { mediaId: mediaIds[0] })).toEqual(member);
            expect(await service.addMedia(album.id, { mediaId: mediaIds[1] })).toMatchObject({ position: 13 });
            await service.addMedia(album.id, { mediaId: mediaIds[1], position: 1 });
            expect((await service.listMedia(album.id, {})).items.map((row) => row.id)).toEqual([
                mediaIds[1],
                mediaIds[0],
            ]);
            expect(await tx.albumMedia.count()).toBe(2);
        });
    });

    it('requires live cover membership and excludes deleted media from gallery, counts and cover', async () => {
        await fixture(async (tx, service) => {
            const album = await service.create({ name: 'Cover' });
            const other = await service.create({ name: 'Other' });
            await service.addMedia(other.id, { mediaId: mediaIds[0] });
            await expect(service.update(album.id, { coverMediaId: mediaIds[0] })).rejects.toMatchObject({
                statusCode: 400,
            });
            await expect(service.addMedia(album.id, { mediaId: mediaIds[3] })).rejects.toMatchObject({
                statusCode: 404,
            });
            await service.addMedia(album.id, { mediaId: mediaIds[0] });
            await service.addMedia(album.id, { mediaId: mediaIds[1] });
            await service.update(album.id, { coverMediaId: mediaIds[0] });
            await tx.media.update({ where: { id: mediaIds[0] }, data: { deletedAt: new Date() } });
            expect(await service.detail(album.id)).toMatchObject({
                coverMediaId: null,
                counts: { media: 1, images: 0, videos: 1 },
            });
            expect((await service.listMedia(album.id, {})).items.map((row) => row.id)).toEqual([mediaIds[1]]);
            await expect(service.update(album.id, { coverMediaId: mediaIds[0] })).rejects.toMatchObject({
                statusCode: 400,
            });
            await service.removeMedia(album.id, mediaIds[0]);
            expect(await tx.album.findUnique({ where: { id: album.id } })).toMatchObject({ coverMediaId: null });
        });
    });

    it('searches literal wildcards, counts matching albums, and sorts equal timestamps deterministically', async () => {
        await fixture(async (tx, service) => {
            const date = new Date('2026-01-01T00:00:00.000Z');
            const ids = [1, 2, 3].map((n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
            for (const [index, id] of ids.entries())
                await tx.album.create({
                    data: {
                        id,
                        name: index === 0 ? 'Literal_%' : 'Trip',
                        description: index === 1 ? 'Summer beach' : null,
                        slug: `trip-${index}`,
                        createdAt: date,
                    },
                });
            expect((await service.list({ q: '_%' })).items.map((row) => row.id)).toEqual([ids[0]]);
            expect((await service.list({ q: 'BEACH' })).items.map((row) => row.id)).toEqual([ids[1]]);
            expect(await service.list({ page: '2', limit: '1' })).toMatchObject({
                items: [{ id: ids[1] }],
                pagination: { total: 3, totalPages: 3 },
            });
            expect((await service.list({ page: '4', limit: '1' })).items).toEqual([]);
        });
    });

    it('filters and sorts the full collection before selecting a page', async () => {
        await fixture(async (tx, service) => {
            const ids = [1, 2, 3, 4].map((n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
            for (const [index, id] of ids.entries()) {
                await tx.album.create({
                    data: {
                        id,
                        slug: `sorted-${index}`,
                        name: index === 0 ? 'Zulu' : 'Alpha',
                        visibility: index === 3 ? 'PRIVATE' : 'PUBLIC',
                        createdAt: new Date(index === 0 ? '2026-01-02T00:00:00.000Z' : '2026-01-01T00:00:00.000Z'),
                    },
                });
            }
            for (const [sort, expected] of [
                ['newest', [ids[0], ids[2], ids[1]]],
                ['oldest', [ids[1], ids[2], ids[0]]],
                ['name', [ids[1], ids[2], ids[0]]],
            ]) {
                const seen = [];
                for (let page = 1; page <= 3; page++) {
                    const result = await service.list({ visibility: 'PUBLIC', sort, page: String(page), limit: '1' });
                    expect(result.pagination).toMatchObject({ total: 3, totalPages: 3 });
                    seen.push(result.items[0].id);
                }
                expect(seen).toEqual(expected);
            }
            expect((await service.list({ visibility: 'PRIVATE', sort: 'name' })).items.map((row) => row.id)).toEqual([
                ids[3],
            ]);
        });
    });

    it('filters membership media before cursor pagination and rejects cursors from other searches', async () => {
        await fixture(async (tx, service) => {
            const album = await service.create({ name: 'Filtered gallery' });
            await tx.media.update({ where: { id: mediaIds[0] }, data: { originalFilename: 'Beach_% one.jpg' } });
            await tx.media.update({ where: { id: mediaIds[2] }, data: { originalFilename: 'Beach_% two.jpg' } });
            await tx.favorite.create({ data: { mediaId: mediaIds[0] } });
            for (const id of mediaIds.slice(0, 3)) await service.addMedia(album.id, { mediaId: id, position: 5 });
            const filters = { q: 'beach_%', type: 'IMAGE', limit: '1' };
            const first = await service.listMedia(album.id, filters);
            expect(first.items).toHaveLength(1);
            expect(first.hasMore).toBe(true);
            const second = await service.listMedia(album.id, { ...filters, cursor: first.nextCursor });
            expect(second.hasMore).toBe(false);
            expect(new Set([...first.items, ...second.items].map((row) => row.id))).toEqual(
                new Set([mediaIds[0], mediaIds[2]]),
            );
            expect(
                (await service.listMedia(album.id, { ...filters, favorite: 'true' })).items.map((row) => row.id),
            ).toEqual([mediaIds[0]]);
            expect(
                (await service.listMedia(album.id, { ...filters, favorite: 'false' })).items.map((row) => row.id),
            ).toEqual([mediaIds[2]]);
            await expect(
                service.listMedia(album.id, { ...filters, q: 'changed', cursor: first.nextCursor }),
            ).rejects.toMatchObject({ statusCode: 400 });
        });
    });

    it('maps slug conflicts and rolls back failed writes without corrupting the transaction', async () => {
        await fixture(async (_tx, service) => {
            const first = await service.create({ name: 'First', slug: 'same' });
            const second = await service.create({ name: 'Second', slug: 'other' });
            await expect(service.create({ name: 'Conflict', slug: 'same' })).rejects.toMatchObject({ statusCode: 409 });
            await expect(service.update(second.id, { name: 'Corrupted', slug: 'same' })).rejects.toMatchObject({
                statusCode: 409,
            });
            expect(await service.detail(second.id)).toMatchObject({ name: 'Second', slug: 'other' });
            await service.remove(first.id);
            await expect(service.create({ name: 'Conflict', slug: 'same' })).rejects.toMatchObject({ statusCode: 409 });
            expect((await service.list({})).pagination.total).toBe(1);
        });
    });

    it('returns thumbnails only without signing originals or exposing internal metadata', async () => {
        await fixture(async (tx, service) => {
            const album = await service.create({ name: 'Gallery' });
            await service.addMedia(album.id, { mediaId: mediaIds[0] });
            for (const type of ['ORIGINAL', 'PREVIEW', 'THUMBNAIL'])
                await tx.mediaVariant.create({
                    data: {
                        mediaId: mediaIds[0],
                        type,
                        name: 'small',
                        format: 'webp',
                        fileSize: 10n,
                        storageKey: `${type}.webp`,
                    },
                });
            await tx.mediaMetadata.create({ data: { mediaId: mediaIds[0], rawMetadata: { private: true } } });
            const item = (await service.listMedia(album.id, {})).items[0];
            expect(item.thumbnails).toEqual([
                {
                    name: 'small',
                    format: 'webp',
                    width: null,
                    height: null,
                    url: 'https://assets.example/THUMBNAIL.webp',
                },
            ]);
            for (const key of ['fileSize', 'storageKey', 'metadata', 'variants', 'deletedAt'])
                expect(item).not.toHaveProperty(key);
        });
    });
    it('serializes concurrent appends and keeps the cover valid during concurrent removal', async () => {
        await database.withClient(async (client, schema) => {
            // Production repository opens real transactions; scope raw locks to the isolated schema.
            const scopedClient = {
                $connect: () => client.$connect(),
                $transaction: (run, options) =>
                    client.$transaction(async (tx) => {
                        await tx.$queryRaw`SELECT set_config('search_path', ${schema}, true)`;
                        return run(tx);
                    }, options),
            };
            const { service } = createAlbumModule({ client: scopedClient, storage });
            const album = await service.create({ name: 'Concurrent' });
            try {
                for (const id of mediaIds.slice(0, 3))
                    await client.media.create({
                        data: {
                            id,
                            type: 'IMAGE',
                            originalFilename: 'photo.jpg',
                            mimeType: 'image/jpeg',
                            extension: 'jpg',
                            fileSize: 10n,
                        },
                    });
                await Promise.all(mediaIds.slice(0, 3).map((mediaId) => service.addMedia(album.id, { mediaId })));
                const page = await service.listMedia(album.id, {});
                expect(page.items.map((row) => row.position)).toEqual([0, 1, 2]);
                expect(new Set(page.items.map((row) => row.id)).size).toBe(3);
                const repeated = await Promise.all([
                    service.addMedia(album.id, { mediaId: mediaIds[0] }),
                    service.addMedia(album.id, { mediaId: mediaIds[0] }),
                ]);
                expect(repeated[0]).toEqual(repeated[1]);
                await service.update(album.id, { coverMediaId: mediaIds[0] });
                const outcomes = await Promise.allSettled([
                    service.update(album.id, { coverMediaId: mediaIds[0] }),
                    service.removeMedia(album.id, mediaIds[0]),
                ]);
                expect(outcomes[1].status).toBe('fulfilled');
                if (outcomes[0].status === 'rejected') expect(outcomes[0].reason.statusCode).toBe(400);
                expect(await service.detail(album.id)).toMatchObject({ coverMediaId: null, counts: { media: 2 } });
            } finally {
                await client.album.delete({ where: { id: album.id } });
                await client.media.deleteMany({ where: { id: { in: mediaIds } } });
            }
        });
    });
});
