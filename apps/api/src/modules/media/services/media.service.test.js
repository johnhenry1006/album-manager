import { describe, expect, it, vi } from 'vitest';

import { createMediaService, createMediaVariantService } from '../index.js';

const id = 'a0000000-0000-4000-8000-000000000001';
const input = {
    type: 'IMAGE',
    originalFilename: 'photo.jpg',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    fileSize: '5000000000',
};
const checksum = 'a'.repeat(64);

function mediaService() {
    const repository = {
        create: vi.fn(async (data) => ({ id, ...data })),
        update: vi.fn(async (key, data) => ({ id: key, ...data })),
        findById: vi.fn(async () => ({ id, deletedAt: null })),
        findByChecksum: vi.fn(async () => null),
    };
    return { service: createMediaService({ repository }), repository };
}

describe('media domain', () => {
    it('creates a pending media identity preserving large byte sizes', async () => {
        const { service } = mediaService();
        expect(await service.create(input)).toMatchObject({ id, status: 'PENDING', fileSize: 5000000000n });
    });
    it('persists measured dimensions with a derived aspect ratio and normalized digest', async () => {
        const { service } = mediaService();
        expect(
            await service.updateMetadata(id, { width: 4000, height: 3000, checksum: checksum.toUpperCase() }),
        ).toMatchObject({ width: 4000, height: 3000, aspectRatio: 4 / 3, checksum });
    });
    it.each([
        { fileSize: -1 },
        { fileSize: Number.MAX_SAFE_INTEGER + 1 },
        { width: 0, height: 10 },
        { width: 10 },
        { width: 10, height: 10, aspectRatio: 2 },
        { checksum: 'invalid' },
        { status: 'COMPLETED' },
        { deletedAt: new Date() },
        { fileSize: '9223372036854775808' },
    ])('rejects invalid creation metadata %j before persistence', async (patch) => {
        const { service, repository } = mediaService();
        await expect(service.create({ ...input, ...patch })).rejects.toMatchObject({ statusCode: 400 });
        expect(repository.create).not.toHaveBeenCalled();
    });
    it('only lets metadata updates change processing metadata', async () => {
        const { service } = mediaService();
        await expect(service.updateMetadata(id, { originalFilename: 'changed.jpg' })).rejects.toMatchObject({
            statusCode: 400,
        });
    });
    it('updates processing status and loads existing media', async () => {
        const { service } = mediaService();
        expect(await service.updateProcessingStatus(id, 'READY')).toMatchObject({ status: 'READY' });
        expect(await service.load(id)).toMatchObject({ id });
    });
    it('returns a not-found domain error for missing media', async () => {
        const { service, repository } = mediaService();
        repository.findById.mockResolvedValue(null);
        await expect(service.load(id)).rejects.toMatchObject({ statusCode: 404 });
    });
    it('deliberately includes deleted identities in duplicate lookup', async () => {
        const { service, repository } = mediaService();
        repository.findByChecksum.mockResolvedValue({ id, checksum, deletedAt: new Date() });
        expect(await service.findDuplicateByChecksum(checksum)).toMatchObject({ id, checksum });
        expect(repository.findByChecksum).toHaveBeenCalledWith(checksum, { includeDeleted: true });
    });
});

describe('media variants', () => {
    const variant = { mediaId: id, type: 'THUMBNAIL', format: 'WEBP', fileSize: 100, storageKey: 'media/thumb.webp' };
    function setup(type = 'THUMBNAIL') {
        const repository = {
            create: vi.fn(async (data) => ({ id, ...data })),
            createOriginal: vi.fn(async (data) => ({ id, ...data })),
            findById: vi.fn(async () => ({ id, mediaId: id, type })),
            findByIdentity: vi.fn(async () => null),
            update: vi.fn(async (key, data) => ({ id: key, ...data })),
        };
        const mediaService = { load: vi.fn(async () => ({ id })) };
        return { service: createMediaVariantService({ repository, mediaService }), repository };
    }
    it('normalizes variant formats and sizes', async () => {
        expect(await setup().service.create(variant)).toMatchObject({ format: 'webp', fileSize: 100n });
    });
    it('uses the serialized original registration operation', async () => {
        const { service, repository } = setup();
        await service.create({ ...variant, type: 'ORIGINAL' });
        expect(repository.createOriginal).toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
    });
    it('refuses any update to an original', async () => {
        await expect(setup('ORIGINAL').service.update(id, { width: 100, height: 100 })).rejects.toMatchObject({
            statusCode: 409,
            code: 'ORIGINAL_IMMUTABLE',
        });
    });
    it('updates derivative metadata without changing its identity', async () => {
        expect(await setup().service.update(id, { width: 100, height: 50, quality: 80 })).toMatchObject({
            width: 100,
            quality: 80,
        });
        await expect(setup().service.update(id, { type: 'ORIGINAL' })).rejects.toMatchObject({ statusCode: 400 });
    });
    it.each([{ quality: 0 }, { quality: 101 }, { storageKey: '../bad' }, { format: '' }, { mediaId: 'bad' }])(
        'rejects invalid variant metadata %j',
        async (patch) => {
            await expect(setup().service.create({ ...variant, ...patch })).rejects.toMatchObject({ statusCode: 400 });
        },
    );
    it('loads variants by their normalized rendition identity', async () => {
        const { service, repository } = setup();
        await service.findByIdentity({ mediaId: id, type: 'THUMBNAIL', format: 'WEBP' });
        expect(repository.findByIdentity).toHaveBeenCalledWith({
            mediaId: id,
            type: 'THUMBNAIL',
            format: 'webp',
            name: 'default',
        });
    });
});

describe('domain output and partial update boundaries', () => {
    it('returns scalar domain data without persistence relations', async () => {
        const { service, repository } = mediaService();
        repository.findById.mockResolvedValue({
            id,
            fileSize: 5000000000n,
            albums: [{ id }],
            uploadFiles: [{ error: 'internal' }],
        });
        const result = await service.load(id);
        expect(result).toEqual({ id, fileSize: 5000000000n });
    });
    it('updates ordinary media fields and clears all measured dimensions together', async () => {
        const { service } = mediaService();
        expect(await service.update(id, { originalFilename: 'new.jpg', width: null, height: null })).toMatchObject({
            originalFilename: 'new.jpg',
            width: null,
            height: null,
            aspectRatio: null,
        });
    });
    it('rejects an explicitly null status instead of defaulting it', async () => {
        await expect(mediaService().service.create({ ...input, status: null })).rejects.toMatchObject({
            statusCode: 400,
        });
    });
    it.each(['bad-id', null, 42])('rejects invalid media identifiers %j', async (key) => {
        await expect(mediaService().service.load(key)).rejects.toMatchObject({ statusCode: 400 });
    });
    it('returns null when a checksum has no duplicate', async () => {
        expect(await mediaService().service.findDuplicateByChecksum(checksum)).toBeNull();
    });
});

it('distinguishes thumbnail renditions by name and rejects unsafe rendition names', async () => {
    const repository = { findByIdentity: vi.fn(async () => null) };
    const service = createMediaVariantService({ repository, mediaService: {} });
    await service.findByIdentity({ mediaId: id, type: 'THUMBNAIL', format: 'WEBP', name: 'thumbnail-800' });
    expect(repository.findByIdentity).toHaveBeenCalledWith({
        mediaId: id,
        type: 'THUMBNAIL',
        format: 'webp',
        name: 'thumbnail-800',
    });
    await expect(
        service.findByIdentity({ mediaId: id, type: 'THUMBNAIL', format: 'webp', name: '../original' }),
    ).rejects.toMatchObject({ code: 'INVALID_MEDIA_INPUT' });
});
