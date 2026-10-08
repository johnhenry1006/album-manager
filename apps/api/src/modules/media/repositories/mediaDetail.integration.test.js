import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { createMediaDetailModule } from '../index.js';

describe.skipIf(process.env.DATABASE_TESTS !== '1')('media detail with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

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
            await tx.favorite.create({ data: { mediaId: id } });
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
            const detail = await service.detail(id);
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
            expect(await service.detail(id)).toMatchObject({
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
            expect((await service.detail(id)).variants).toEqual([]);
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
                await expect(service.detail(mediaId)).rejects.toMatchObject({ statusCode: 404 });
                await expect(service.originalUrl(mediaId)).rejects.toMatchObject({ statusCode: 404 });
            }
            expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
        });
    });
});
