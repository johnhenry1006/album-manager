import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app/authenticatedApp.testUtils.js';

const id = 'a0000000-0000-4000-8000-000000000001';
const time = new Date('2026-10-01T12:00:00.000Z');
const variant = {
    id,
    type: 'PREVIEW',
    name: 'preview',
    format: 'webp',
    width: 800,
    height: 600,
    fileSize: 1234n,
    quality: 80,
    storageKey: `media/${id}/preview.webp`,
    createdAt: time,
};
const row = {
    id,
    type: 'IMAGE',
    originalFilename: 'photo.jpg',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    fileSize: 9007199254740993n,
    width: 4000,
    height: 3000,
    aspectRatio: 4 / 3,
    checksum: 'a'.repeat(64),
    status: 'READY',
    takenAt: time,
    createdAt: time,
    updatedAt: time,
    favorites: [{ id }],
    albums: [
        {
            position: 2,
            createdAt: time,
            album: { id, name: 'Holiday', slug: 'holiday', description: 'Trip', visibility: 'PRIVATE' },
        },
    ],
    categories: [{ category: { id, name: 'Travel', slug: 'travel', parentId: null } }],
    tags: [{ tag: { id, name: 'Beach', slug: 'beach' } }],
    metadata: {
        cameraMake: 'Camera',
        cameraModel: 'Model',
        lens: 'Lens',
        focalLength: 50,
        aperture: 2.8,
        iso: 100,
        shutterSpeed: '1/100',
        latitude: 10,
        longitude: 100,
        rawMetadata: { camera: 'EXIF' },
    },
    variants: [variant],
};

describe('media detail and original URL HTTP contracts', () => {
    let app;
    afterEach(async () => {
        await app?.close();
        vi.restoreAllMocks();
    });

    function setup(record = row, config = { displayUrlExpirySeconds: 900, originalUrlExpirySeconds: 900 }) {
        vi.spyOn(Date, 'now').mockReturnValue(time.getTime());
        const findUnique = vi.fn().mockResolvedValue(record);
        const storage = {
            close: vi.fn(),
            createPresignedDownloadUrl: vi.fn(async ({ key, expiresIn }) => ({
                url: `https://assets.example/${key}?signature=temporary`,
                method: 'GET',
                headers: {},
                expiresIn,
                secretAccessKey: 'must-never-serialize',
            })),
        };
        app = buildApp({
            logger: false,
            database: { client: { media: { findUnique } }, connect: vi.fn(), disconnect: vi.fn() },
            storage,
            mediaDetailConfig: config,
        });
        return { findUnique, storage };
    }

    it('returns core fields, relations, EXIF and signed display variants without original URLs or private fields', async () => {
        const { findUnique, storage } = setup();
        const response = await app.inject(`/api/media/${id}`);
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.json()).toEqual({
            id,
            type: 'IMAGE',
            originalFilename: 'photo.jpg',
            mimeType: 'image/jpeg',
            extension: 'jpg',
            fileSize: '9007199254740993',
            width: 4000,
            height: 3000,
            aspectRatio: 4 / 3,
            checksum: 'a'.repeat(64),
            status: 'READY',
            takenAt: time.toISOString(),
            createdAt: time.toISOString(),
            updatedAt: time.toISOString(),
            favorite: true,
            albums: [
                {
                    id,
                    name: 'Holiday',
                    slug: 'holiday',
                    description: 'Trip',
                    visibility: 'PRIVATE',
                    position: 2,
                    addedAt: time.toISOString(),
                },
            ],
            categories: [{ id, name: 'Travel', slug: 'travel', parentId: null }],
            tags: [{ id, name: 'Beach', slug: 'beach' }],
            metadata: row.metadata,
            variants: [
                {
                    id,
                    type: 'PREVIEW',
                    name: 'preview',
                    format: 'webp',
                    width: 800,
                    height: 600,
                    fileSize: '1234',
                    quality: 80,
                    url: `https://assets.example/media/${id}/preview.webp?signature=temporary`,
                    expiresIn: 900,
                    expiresAt: '2026-10-01T12:15:00.000Z',
                },
            ],
        });
        expect(response.body).not.toContain('storageKey');
        expect(response.body).not.toContain('must-never-serialize');
        expect(findUnique.mock.calls[0][0].where).toEqual({ id, deletedAt: null });
        const select = findUnique.mock.calls[0][0].select;
        expect(select.albums.where).toEqual({ album: { deletedAt: null } });
        expect(select.variants.where.type.in).toEqual(['OPTIMIZED', 'PREVIEW', 'THUMBNAIL', 'BLUR_PLACEHOLDER']);
        expect(select.variants.where.format.in).toContain('webp');
        expect(select.variants.where.format.in).not.toContain('svg');
        expect(select).not.toHaveProperty('uploadFiles');
        expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith({
            key: variant.storageKey,
            expiresIn: 900,
            method: 'GET',
        });
    });

    it('signs every safe display type and refuses originals or executable formats even if returned by a repository', async () => {
        const variants = ['OPTIMIZED', 'PREVIEW', 'THUMBNAIL', 'BLUR_PLACEHOLDER', 'ORIGINAL'].map((type) => ({
            ...variant,
            type,
            storageKey: type,
        }));
        variants.push({ ...variant, format: 'svg', storageKey: 'unsafe-svg' });
        variants.push({ ...variant, format: 'html', storageKey: 'unsafe-html' });
        const { storage } = setup({ ...row, variants });
        const response = await app.inject(`/api/media/${id}`);
        expect(response.statusCode).toBe(200);
        expect(response.json().variants.map((v) => v.type)).toEqual([
            'OPTIMIZED',
            'PREVIEW',
            'THUMBNAIL',
            'BLUR_PLACEHOLDER',
        ]);
        expect(storage.createPresignedDownloadUrl).toHaveBeenCalledTimes(4);
    });

    it('handles absent favorite, relations, metadata, dimensions and taken date', async () => {
        setup({
            ...row,
            favorites: [],
            albums: [],
            categories: [],
            tags: [],
            metadata: null,
            variants: [],
            width: null,
            height: null,
            aspectRatio: null,
            takenAt: null,
        });
        const response = await app.inject(`/api/media/${id}`);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            favorite: false,
            albums: [],
            categories: [],
            tags: [],
            metadata: null,
            variants: [],
            width: null,
            height: null,
            aspectRatio: null,
            takenAt: null,
        });
    });

    it('signs originals only from the dedicated endpoint with explicit expiry and no provider credentials', async () => {
        const { findUnique, storage } = setup(
            { id, variants: [{ storageKey: `media/${id}/original.jpg` }] },
            { displayUrlExpirySeconds: 60, originalUrlExpirySeconds: 120 },
        );
        const response = await app.inject(`/api/media/${id}/original-url`);
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.json()).toEqual({
            url: `https://assets.example/media/${id}/original.jpg?signature=temporary`,
            method: 'GET',
            expiresIn: 120,
            expiresAt: '2026-10-01T12:02:00.000Z',
        });
        expect(findUnique.mock.calls[0][0]).toEqual({
            where: { id, deletedAt: null },
            select: {
                id: true,
                variants: {
                    where: { type: 'ORIGINAL' },
                    take: 1,
                    orderBy: { id: 'asc' },
                    select: { storageKey: true },
                },
            },
        });
        expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith({
            key: `media/${id}/original.jpg`,
            method: 'GET',
            download: true,
            expiresIn: 120,
        });
    });

    it('uses the configured display expiry and conservatively reports second-precision expiry', async () => {
        setup(row, { displayUrlExpirySeconds: 60, originalUrlExpirySeconds: 120 });
        Date.now.mockReturnValue(time.getTime() + 900);
        const response = await app.inject(`/api/media/${id}`);
        expect(response.statusCode).toBe(200);
        expect(response.json().variants[0]).toMatchObject({ expiresIn: 60, expiresAt: '2026-10-01T12:01:00.000Z' });
    });

    it.each(['', '/original-url'])(
        'returns 404 for missing/deleted media on detail%s without signing',
        async (suffix) => {
            const { storage, findUnique } = setup(null);
            expect((await app.inject(`/api/media/${id}${suffix}`)).statusCode).toBe(404);
            expect(findUnique).toHaveBeenCalledOnce();
            expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
        },
    );

    it('returns 404 when a media record has no original variant', async () => {
        const { storage } = setup({ id, variants: [] });
        expect((await app.inject(`/api/media/${id}/original-url`)).statusCode).toBe(404);
        expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it.each([
        '/api/media/not-a-uuid',
        '/api/media/not-a-uuid/original-url',
        `/api/media/${id}?includeOriginal=true`,
        `/api/media/${id}/original-url?expiresIn=604800`,
        `/api/media/${id}/original-url?method=PUT`,
    ])('rejects invalid input %s before persistence', async (url) => {
        const { findUnique, storage } = setup();
        expect((await app.inject(url)).statusCode).toBe(400);
        expect(findUnique).not.toHaveBeenCalled();
        expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it.each(['', '/original-url'])('sanitizes signing failures on detail%s', async (suffix) => {
        const { storage } = setup();
        storage.createPresignedDownloadUrl.mockRejectedValue(new Error('private-credentials signed-url'));
        const response = await app.inject(`/api/media/${id}${suffix}`);
        expect(response.statusCode).toBe(500);
        expect(response.json().error).toBe('INTERNAL_ERROR');
        expect(response.body).not.toContain('private-credentials');
        expect(response.body).not.toContain('signed-url');
    });
});
