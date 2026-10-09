import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import {
    createMediaDetailModule,
    createMediaFavoriteModule,
    createMediaListModule,
    createMediaTrashModule,
} from '../index.js';

describe.skipIf(process.env.DATABASE_TESTS !== '1')('media detail with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

    it('keeps video metadata, albums, taxonomy, favorites and search intact across trash and restore', async () => {
        await database.rollback(async (tx) => {
            const actor = { id: '00000000-0000-4000-8000-000000000001' };
            const media = await tx.media.create({
                data: {
                    type: 'VIDEO',
                    originalFilename: 'holiday.mp4',
                    mimeType: 'video/mp4',
                    extension: 'mp4',
                    fileSize: 100n,
                    status: 'READY',
                    metadata: {
                        create: { duration: 1.5, videoCodec: 'h264', audioCodec: null, frameRate: 25, bitrate: 10000 },
                    },
                    variants: {
                        create: [
                            { type: 'ORIGINAL', format: 'mp4', storageKey: 'video/source.mp4', fileSize: 100n },
                            {
                                type: 'OPTIMIZED',
                                name: 'playback',
                                format: 'mp4',
                                storageKey: 'video/playback.mp4',
                                fileSize: 50n,
                            },
                            {
                                type: 'THUMBNAIL',
                                name: 'thumbnail-200',
                                format: 'webp',
                                storageKey: 'video/thumb.webp',
                                fileSize: 10n,
                            },
                        ],
                    },
                },
            });
            const album = await tx.album.create({
                data: {
                    name: 'Holiday',
                    slug: 'video-holiday',
                    coverMediaId: media.id,
                    media: { create: { mediaId: media.id } },
                },
            });
            const tag = await tx.tag.create({
                data: { name: 'Beach', slug: 'video-beach', media: { create: { mediaId: media.id } } },
            });
            const category = await tx.category.create({
                data: { name: 'Travel', slug: 'video-travel', media: { create: { mediaId: media.id } } },
            });
            const storage = {
                createPresignedDownloadUrl: vi.fn(async ({ key }) => ({ url: `https://assets.example/${key}` })),
            };
            const detail = createMediaDetailModule({
                client: tx,
                storage,
                config: { displayUrlExpirySeconds: 900 },
            }).service;
            const list = createMediaListModule({
                client: tx,
                storage,
                config: { maxLimit: 200, urlExpirySeconds: 900 },
            }).service;
            const trash = createMediaTrashModule({ client: tx, storage }).service;
            await createMediaFavoriteModule({ client: tx }).service.add(media.id, undefined, undefined, actor);
            const filters = { type: 'VIDEO', q: 'holiday', tag: tag.id, category: category.id, favorite: 'true' };
            expect((await list.list(filters, actor)).items).toMatchObject([
                { id: media.id, thumbnails: [{ format: 'webp' }] },
            ]);
            await trash.softDelete(media.id);
            expect((await list.list(filters, actor)).items).toEqual([]);
            await expect(detail.detail(media.id, undefined, actor)).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
            await trash.restore(media.id);
            expect(await detail.detail(media.id, undefined, actor)).toMatchObject({
                type: 'VIDEO',
                favorite: true,
                albums: [{ id: album.id }],
                tags: [{ id: tag.id }],
                categories: [{ id: category.id }],
                metadata: { duration: 1.5, videoCodec: 'h264', audioCodec: null },
            });
            expect((await list.list(filters, actor)).items).toHaveLength(1);
            expect((await tx.album.findUnique({ where: { id: album.id } })).coverMediaId).toBe(media.id);
            expect(await tx.mediaVariant.count({ where: { mediaId: media.id } })).toBe(3);
        });
    });

    async function fixture(run) {
        await database.rollback(async (tx) => {
            const media = await tx.media.create({
                data: {
                    type: 'IMAGE',
                    originalFilename: 'photo.jpg',
                    mimeType: 'image/jpeg',
                    extension: 'jpg',
                    fileSize: 9007199254740993n,
                    status: 'READY',
                },
            });
            const storage = {
                createPresignedDownloadUrl: vi.fn(async ({ key }) => ({ url: `https://assets.example/${key}` })),
            };
            const { service } = createMediaDetailModule({
                client: tx,
                storage,
                config: { displayUrlExpirySeconds: 60, originalUrlExpirySeconds: 120 },
            });
            await run(tx, media.id, service, storage);
        });
    }

    it('loads relations and EXIF, excludes deleted albums, and preserves every safe display variant', async () => {
        await fixture(async (tx, id, service, storage) => {
            const liveAlbum = await tx.album.create({
                data: { name: 'Live', slug: 'live', media: { create: { mediaId: id, position: 3 } } },
            });
            await tx.album.create({
                data: { name: 'Deleted', slug: 'deleted', deletedAt: new Date(), media: { create: { mediaId: id } } },
            });
            const category = await tx.category.create({
                data: { name: 'Travel', slug: 'travel', media: { create: { mediaId: id } } },
            });
            const tag = await tx.tag.create({
                data: { name: 'Beach', slug: 'beach', media: { create: { mediaId: id } } },
            });
            await tx.favorite.create({ data: { userId: '00000000-0000-4000-8000-000000000001', mediaId: id } });
            await tx.mediaMetadata.create({
                data: { mediaId: id, cameraMake: 'Test camera', rawMetadata: { exif: { ISO: 100 } } },
            });
            for (const type of ['ORIGINAL', 'OPTIMIZED', 'PREVIEW', 'THUMBNAIL', 'BLUR_PLACEHOLDER']) {
                await tx.mediaVariant.create({
                    data: { mediaId: id, type, format: 'webp', fileSize: 100n, storageKey: `${id}/${type}.webp` },
                });
            }
            for (const format of ['svg', 'html']) {
                await tx.mediaVariant.create({
                    data: { mediaId: id, type: 'PREVIEW', format, fileSize: 100n, storageKey: `${id}/${format}` },
                });
            }
            // Multiple thumbnail identities must all be included.
            await tx.mediaVariant.create({
                data: {
                    mediaId: id,
                    type: 'THUMBNAIL',
                    name: 'thumbnail-200',
                    format: 'webp',
                    fileSize: 10n,
                    width: 200,
                    height: 150,
                    storageKey: `${id}/thumb-200.webp`,
                },
            });
            const detail = await service.detail(id, undefined, { id: '00000000-0000-4000-8000-000000000001' });
            expect(detail).toMatchObject({
                id,
                favorite: true,
                fileSize: '9007199254740993',
                albums: [{ id: liveAlbum.id, name: 'Live', position: 3 }],
                categories: [{ id: category.id, name: 'Travel' }],
                tags: [{ id: tag.id, name: 'Beach' }],
                metadata: { cameraMake: 'Test camera', rawMetadata: { exif: { ISO: 100 } } },
            });
            expect(detail.variants).toHaveLength(5);
            expect(detail.variants.filter((variant) => variant.type === 'THUMBNAIL')).toHaveLength(2);
            expect(detail.variants.map((variant) => variant.type)).not.toContain('ORIGINAL');
            expect(storage.createPresignedDownloadUrl).toHaveBeenCalledTimes(5);
            expect(JSON.stringify(detail)).not.toContain('storageKey');
            expect(JSON.stringify(detail)).not.toContain('ORIGINAL.webp');
            expect(detail).not.toHaveProperty('originalUrl');
        });
    });

    it('handles absent optional data and finds an original only through the dedicated service', async () => {
        await fixture(async (tx, id, service, storage) => {
            expect(await service.detail(id, undefined, { id: '00000000-0000-4000-8000-000000000001' })).toMatchObject({
                favorite: false,
                albums: [],
                categories: [],
                tags: [],
                metadata: null,
                takenAt: null,
                width: null,
                height: null,
                aspectRatio: null,
                variants: [],
            });
            await expect(service.originalUrl(id)).rejects.toMatchObject({ statusCode: 404 });
            expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
            await tx.mediaVariant.create({
                data: {
                    mediaId: id,
                    type: 'ORIGINAL',
                    format: 'jpeg',
                    fileSize: 100n,
                    storageKey: `${id}/original.jpg`,
                },
            });
            const original = await service.originalUrl(id);
            expect(original).toMatchObject({
                url: `https://assets.example/${id}/original.jpg`,
                method: 'GET',
                expiresIn: 120,
            });
            expect(Date.parse(original.expiresAt)).toBeGreaterThan(Date.now());
            expect(
                (await service.detail(id, undefined, { id: '00000000-0000-4000-8000-000000000001' })).variants,
            ).toEqual([]);
            expect(storage.createPresignedDownloadUrl).toHaveBeenCalledOnce();
        });
    });

    it('refuses detail and original access for soft-deleted and missing media before signing', async () => {
        await fixture(async (tx, id, service, storage) => {
            await tx.mediaVariant.create({
                data: {
                    mediaId: id,
                    type: 'ORIGINAL',
                    format: 'jpeg',
                    fileSize: 100n,
                    storageKey: `${id}/original.jpg`,
                },
            });
            await tx.media.update({ where: { id }, data: { deletedAt: new Date() } });
            for (const mediaId of [id, randomUUID()]) {
                await expect(
                    service.detail(mediaId, undefined, { id: '00000000-0000-4000-8000-000000000001' }),
                ).rejects.toMatchObject({ statusCode: 404 });
                await expect(service.originalUrl(mediaId)).rejects.toMatchObject({ statusCode: 404 });
            }
            expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
        });
    });
});
