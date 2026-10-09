import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { buildApp } from '../../../app/authenticatedApp.testUtils.js';
import * as mediaModule from '../index.js';

const ids = [1, 2, 3, 4].map((n) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const objectKey = (filename) => `media/2026/10/08/${ids[0]}/original/${filename}`;
const mediaData = {
    type: 'IMAGE',
    status: 'READY',
    originalFilename: 'photo.jpg',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    fileSize: 10n,
};

describe.skipIf(process.env.DATABASE_TESTS !== '1')('trash lifecycle with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

    async function fixture(run) {
        await database.withClient(async (client, schema) => {
            const scoped = {
                $connect() {},
                $transaction: (callback, options) =>
                    client.$transaction(async (tx) => {
                        await tx.$queryRaw`SELECT set_config('search_path', ${schema}, true)`;
                        return callback(tx);
                    }, options),
                media: client.media,
                mediaVariant: client.mediaVariant,
            };
            const objects = new Set();
            const removed = [];
            const storage = {
                close() {},
                async delete({ key }) {
                    objects.delete(key);
                    removed.push(key);
                },
                async createPresignedDownloadUrl({ key }) {
                    return { url: `https://assets.example/${key}` };
                },
            };
            const app = buildApp({
                logger: false,
                database: { client: scoped, connect() {}, disconnect() {} },
                storage,
            });
            const request = (method, url, payload) =>
                app.inject({ method, url, ...(payload === undefined ? {} : { payload }) });
            try {
                await run({ client, scoped, storage, objects, removed, app, request });
            } finally {
                await app.close();
                await client.mediaVariant.deleteMany();
                await client.media.deleteMany();
                await client.album.deleteMany();
            }
        });
    }

    it('soft deletes without touching binaries or relations, hides normal reads, and restores', async () => {
        await fixture(async ({ client, objects, removed, request, app }) => {
            await client.media.create({
                data: {
                    id: ids[0],
                    ...mediaData,
                    favorites: { create: { userId: '00000000-0000-4000-8000-000000000001' } },
                    variants: { create: { type: 'ORIGINAL', format: 'jpg', storageKey: 'source.jpg', fileSize: 10n } },
                },
            });
            objects.add('source.jpg');
            for (let n = 0; n < 2; n++) expect((await request('DELETE', `/api/media/${ids[0]}`)).statusCode).toBe(204);
            const deleted = await client.media.findUnique({ where: { id: ids[0] } });
            expect(deleted.deletedAt).toBeInstanceOf(Date);
            expect(objects.has('source.jpg')).toBe(true);
            expect(removed).toEqual([]);
            expect(await client.favorite.count()).toBe(1);
            expect((await app.inject('/api/media')).json().items).toEqual([]);
            expect((await app.inject(`/api/media/${ids[0]}`)).statusCode).toBe(404);
            expect((await app.inject(`/api/media/${ids[0]}/original-url`)).statusCode).toBe(404);
            expect((await app.inject('/api/trash')).json()).toMatchObject({
                items: [{ id: ids[0], deletedAt: deleted.deletedAt.toISOString() }],
                hasMore: false,
                nextCursor: null,
            });
            for (let n = 0; n < 2; n++)
                expect((await request('POST', `/api/trash/${ids[0]}/restore`)).statusCode).toBe(204);
            expect((await client.media.findUnique({ where: { id: ids[0] } })).deletedAt).toBeNull();
            expect((await app.inject('/api/trash')).json().items).toEqual([]);
            expect((await app.inject('/api/media?favorite=true')).json().items).toMatchObject([{ id: ids[0] }]);
        });
    });

    it('requires explicit confirmation and trashed media before any object deletion', async () => {
        await fixture(async ({ client, removed, request }) => {
            await client.media.create({ data: { id: ids[0], ...mediaData } });
            expect((await request('DELETE', `/api/trash/${ids[0]}/permanent`, { confirm: true })).statusCode).toBe(409);
            await request('DELETE', `/api/media/${ids[0]}`);
            for (const body of [undefined, {}, { confirm: false }, { confirm: 'true' }, { confirm: true, extra: true }])
                expect((await request('DELETE', `/api/trash/${ids[0]}/permanent`, body)).statusCode).toBe(400);
            expect(removed).toEqual([]);
            expect(await client.media.count()).toBe(1);
        });
    });

    it('removes every variant object before hard deletion and cleans dependent rows and album covers', async () => {
        await fixture(async ({ client, objects, removed, request }) => {
            const types = ['ORIGINAL', 'OPTIMIZED', 'PREVIEW', 'THUMBNAIL', 'BLUR_PLACEHOLDER'];
            await client.media.create({
                data: {
                    id: ids[0],
                    ...mediaData,
                    deletedAt: new Date(),
                    favorites: { create: { userId: '00000000-0000-4000-8000-000000000001' } },
                    metadata: { create: {} },
                },
            });
            await client.album.create({
                data: { name: 'Album', slug: 'album', coverMediaId: ids[0], media: { create: { mediaId: ids[0] } } },
            });
            for (const type of types) {
                const storageKey = objectKey(`${type}.jpg`);
                objects.add(storageKey);
                await client.mediaVariant.create({
                    data: { mediaId: ids[0], type, format: 'jpg', storageKey, fileSize: 10n },
                });
            }
            expect((await request('DELETE', `/api/trash/${ids[0]}/permanent`, { confirm: true })).statusCode).toBe(204);
            expect(objects.size).toBe(0);
            expect(removed.sort()).toEqual(types.map((type) => objectKey(`${type}.jpg`)).sort());
            expect(await client.media.count()).toBe(0);
            expect(await client.mediaVariant.count()).toBe(0);
            expect(await client.favorite.count()).toBe(0);
            expect(await client.mediaMetadata.count()).toBe(0);
            expect(await client.albumMedia.count()).toBe(0);
            expect((await client.album.findFirst()).coverMediaId).toBeNull();
        });
    });

    it('commits the purge marker before storage calls, blocks restore after partial failure, and retries after restart', async () => {
        await fixture(async ({ client, scoped, storage, objects, request }) => {
            await client.media.create({ data: { id: ids[0], ...mediaData, deletedAt: new Date() } });
            for (const [type, key] of [
                ['ORIGINAL', objectKey('a.jpg')],
                ['THUMBNAIL', objectKey('b.jpg')],
            ]) {
                objects.add(key);
                await client.mediaVariant.create({
                    data: { mediaId: ids[0], type, format: 'jpg', storageKey: key, fileSize: 10n },
                });
            }
            const remove = storage.delete;
            storage.delete = async ({ key }) => {
                expect((await client.media.findUnique({ where: { id: ids[0] } })).purgeStartedAt).toBeInstanceOf(Date);
                expect((await request('POST', `/api/trash/${ids[0]}/restore`)).statusCode).toBe(409);
                if (key === objectKey('b.jpg')) throw new Error('private storage credentials');
                await remove({ key });
            };
            const response = await request('DELETE', `/api/trash/${ids[0]}/permanent`, { confirm: true });
            expect(response.statusCode).toBe(500);
            expect(response.body).not.toContain('private storage credentials');
            expect(objects.has(objectKey('a.jpg'))).toBe(false);
            expect(await client.mediaVariant.count()).toBe(2);
            storage.delete = remove;
            const restarted = mediaModule.createMediaTrashModule({ client: scoped, storage }).service;
            await restarted.permanent(ids[0], { confirm: true });
            expect(objects.size).toBe(0);
            expect(await client.media.count()).toBe(0);
        });
    });

    it('walks tied deletion timestamps and survives restoring the cursor anchor', async () => {
        await fixture(async ({ client, app, request }) => {
            const time = new Date('2026-01-01T00:00:00Z');
            for (const id of ids) await client.media.create({ data: { id, ...mediaData, deletedAt: time } });
            const first = (await app.inject('/api/trash?limit=1')).json();
            expect(first.items.map((row) => row.id)).toEqual([ids[3]]);
            await request('POST', `/api/trash/${ids[3]}/restore`);
            const rest = (await app.inject(`/api/trash?cursor=${first.nextCursor}`)).json();
            expect(rest.items.map((row) => row.id)).toEqual([ids[2], ids[1], ids[0]]);
            expect(rest.hasMore).toBe(false);
            expect(JSON.stringify(rest)).not.toContain('storageKey');
        });
    });

    it('supports bounded retention cleanup with a cutoff recheck and skips restored candidates', async () => {
        await fixture(async ({ client, scoped, storage }) => {
            for (const [index, id] of ids.entries())
                await client.media.create({
                    data: { id, ...mediaData, deletedAt: new Date(index < 2 ? '2025-01-01' : '2026-01-01') },
                });
            const service = mediaModule.createMediaTrashModule({ client: scoped, storage }).service;
            const result = await service.cleanupExpired({ before: new Date('2025-06-01'), limit: 1 });
            expect(result).toMatchObject({ deleted: [ids[0]], failed: [], skipped: [] });
            expect(await client.media.count()).toBe(3);
            await service.restore(ids[1]);
            expect(await service.cleanupExpired({ before: new Date('2025-06-01'), limit: 10 })).toMatchObject({
                deleted: [],
                failed: [],
            });
        });
    });

    it('rejects malformed IDs, query parameters, bodies and cursors', async () => {
        await fixture(async ({ request }) => {
            for (const [method, url, body] of [
                ['DELETE', '/api/media/bad'],
                ['POST', '/api/trash/bad/restore'],
                ['DELETE', '/api/trash/bad/permanent', { confirm: true }],
                ['GET', '/api/trash?limit=0'],
                ['GET', '/api/trash?cursor=bad'],
                ['GET', '/api/trash?extra=true'],
                ['DELETE', `/api/media/${ids[0]}?force=true`],
                ['DELETE', `/api/media/${ids[0]}`, {}],
                ['POST', `/api/trash/${ids[0]}/restore`, {}],
            ])
                expect((await request(method, url, body)).statusCode).toBe(400);
            expect((await request('DELETE', `/api/media/${ids[0]}`)).statusCode).toBe(404);
            expect((await request('POST', `/api/trash/${ids[0]}/restore`)).statusCode).toBe(404);
        });
    });

    it('waits for in-flight rendition persistence before trashing and purges the resulting variant', async () => {
        await fixture(async ({ client, scoped, storage, objects }) => {
            await client.media.create({ data: { id: ids[0], ...mediaData } });
            let writerPid;
            const writerClient = {
                ...scoped,
                $transaction: (run, options) =>
                    scoped.$transaction(async (tx) => {
                        [{ pid: writerPid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
                        return run(tx);
                    }, options),
            };
            const variants = mediaModule.createMediaModule(writerClient).mediaVariantService;
            const trash = mediaModule.createMediaTrashModule({ client: scoped, storage }).service;
            let release;
            let locked;
            const held = new Promise((resolve) => {
                locked = resolve;
            });
            const gate = new Promise((resolve) => {
                release = resolve;
            });
            const writer = variants.withMediaLock(ids[0], async (service) => {
                locked();
                await gate;
                objects.add(objectKey('late.webp'));
                await service.create({
                    mediaId: ids[0],
                    type: 'THUMBNAIL',
                    format: 'webp',
                    name: 'late',
                    storageKey: objectKey('late.webp'),
                    fileSize: 10n,
                });
            });
            await held;
            const deleting = trash.softDelete(ids[0]);
            try {
                let waiting = false;
                const deadline = Date.now() + 2000;
                while (Date.now() < deadline) {
                    const rows =
                        await client.$queryRaw`SELECT pid FROM pg_stat_activity WHERE ${writerPid}::int = ANY(pg_blocking_pids(pid))`;
                    if (rows.length) {
                        waiting = true;
                        break;
                    }
                    await delay(10);
                }
                expect(waiting).toBe(true);
                release();
                await writer;
                await deleting;
                await trash.permanent(ids[0], { confirm: true });
                expect(objects.size).toBe(0);
                expect(await client.mediaVariant.count()).toBe(0);
                await expect(
                    variants.withMediaLock(ids[0], async () => {
                        objects.add('orphan.webp');
                    }),
                ).rejects.toMatchObject({ statusCode: 404 });
                expect(objects.size).toBe(0);
            } finally {
                release();
                await Promise.allSettled([writer, deleting]);
            }
        });
    });
});
