import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createMediaProcessingService } from './mediaProcessing.service.js';

const mediaId = 'a0000000-0000-4000-8000-000000000001';
const uploadFileId = 'a0000000-0000-4000-8000-000000000002';
const duplicateId = 'a0000000-0000-4000-8000-000000000003';
const bytes = Buffer.from('original encoded image');
const checksum = createHash('sha256').update(bytes).digest('hex');

function setup() {
    const media = {
        id: mediaId,
        type: 'IMAGE',
        status: 'PROCESSING',
        checksum: null,
        createdAt: new Date('2026-10-08'),
    };
    const file = { id: uploadFileId, mediaId, status: 'PROCESSING', duplicateOfMediaId: null };
    const original = { type: 'ORIGINAL', storageKey: 'media/source.jpg', format: 'jpeg' };
    const rows = new Map();
    const objects = new Map([[original.storageKey, bytes]]);
    const specifications = [
        ['OPTIMIZED', 'optimized', 2560],
        ['PREVIEW', 'preview', 1600],
        ['THUMBNAIL', 'thumbnail-800', 800],
        ['THUMBNAIL', 'thumbnail-400', 400],
        ['THUMBNAIL', 'thumbnail-200', 200],
    ];
    const variants = specifications.map(([type, name, maxSize]) => ({
        type,
        name,
        maxSize,
        format: 'webp',
        contentType: 'image/webp',
        width: 100,
        height: 50,
        quality: 80,
        data: Buffer.from(name),
        fileSize: name.length,
    }));
    const mediaService = {
        load: vi.fn(async () => ({ ...media })),
        updateMetadata: vi.fn(async (_id, patch) => Object.assign(media, patch)),
    };
    const mediaVariantService = {
        findByIdentity: vi.fn(async ({ name }) => rows.get(name) ?? null),
        create: vi.fn(async (input) => {
            if (rows.has(input.name)) throw Object.assign(new Error('Conflict'), { code: 'VARIANT_CONFLICT' });
            const row = { id: input.name, ...input };
            rows.set(input.name, row);
            return row;
        }),
        update: vi.fn(async (id, patch) => Object.assign(rows.get(id), patch)),
    };
    const repository = {
        loadUploadFile: vi.fn(async () => ({ ...file })),
        findOriginal: vi.fn(async () => original),
        start: vi.fn(async () => {
            media.status = 'PROCESSING';
            file.status = 'PROCESSING';
        }),
        markDuplicate: vi.fn(async (_media, _file, id) => {
            media.status = 'PENDING';
            file.status = 'DUPLICATE_PENDING';
            file.duplicateOfMediaId = id;
        }),
        finish: vi.fn(async (_media, _file, patch, metadata) => {
            Object.assign(media, patch, { status: 'READY' });
            file.status = 'READY';
            file.error = null;
            file.duplicateOfMediaId = null;
            file.metadata = metadata;
        }),
        repairReadyUpload: vi.fn(async () => {
            file.status = 'READY';
            file.error = null;
        }),
        fail: vi.fn(async () => {
            media.status = 'FAILED';
            file.status = 'FAILED';
            file.error = 'Media processing failed';
        }),
    };
    const duplicateDetectionService = {
        detectDuplicateByChecksum: vi.fn(async () => ({ type: 'NEW_MEDIA', checksum })),
    };
    const settingsService = { getSettings: vi.fn(async () => ({ mode: 'BALANCED', placeholderEnabled: false })) };
    const imageProcessor = {
        inspect: vi.fn(async () => ({ width: 100, height: 50, aspectRatio: 2, format: 'jpeg', orientation: 6 })),
        extractMetadata: vi.fn(async () => ({ cameraMake: 'Camera', rawMetadata: { orientation: 6 } })),
        process: vi.fn(async () => ({ variants })),
    };
    const storage = {
        read: vi.fn(async ({ key }) => objects.get(key)),
        exists: vi.fn(async ({ key }) => objects.has(key)),
        upload: vi.fn(async ({ key, body }) => {
            objects.set(key, body);
            return { key };
        }),
        delete: vi.fn(),
    };
    const dependencies = {
        repository,
        mediaService,
        mediaVariantService,
        duplicateDetectionService,
        settingsService,
        imageProcessor,
        storage,
        withChecksumLock: async (_checksum, run) =>
            run({
                mediaService,
                duplicateDetectionService,
                admissionService: {
                    load: async () => Boolean(file.processingAcceptedAt),
                    accept: async () => {
                        file.processingAcceptedAt = new Date();
                    },
                },
            }),
    };
    return {
        ...dependencies,
        media,
        file,
        original,
        rows,
        objects,
        variants,
        run: (input = {}) => createMediaProcessingService(dependencies).process({ mediaId, uploadFileId, ...input }),
    };
}

describe('media processing orchestration', () => {
    it('persists all renditions, inspected MIME, EXIF and source checksum before READY', async () => {
        const context = setup();
        await context.run();
        expect(context.media).toMatchObject({
            status: 'READY',
            checksum,
            width: 100,
            height: 50,
            aspectRatio: 2,
            mimeType: 'image/jpeg',
        });
        expect(context.file).toMatchObject({ status: 'READY', metadata: { cameraMake: 'Camera' } });
        expect([...context.rows.keys()]).toEqual([
            'optimized',
            'preview',
            'thumbnail-800',
            'thumbnail-400',
            'thumbnail-200',
        ]);
        expect(context.imageProcessor.process).toHaveBeenCalledWith(bytes, {
            mode: 'BALANCED',
            placeholderEnabled: false,
        });
        expect(context.duplicateDetectionService.detectDuplicateByChecksum).toHaveBeenCalledWith(checksum, {
            excludeMediaId: mediaId,
        });
        expect(context.objects.get(context.original.storageKey)).toEqual(bytes);
        expect(context.storage.upload.mock.calls.every(([input]) => input.key !== context.original.storageKey)).toBe(
            true,
        );
    });
    it('defaults to duplicate pending without inspection, settings or expensive generation', async () => {
        const context = setup();
        context.duplicateDetectionService.detectDuplicateByChecksum.mockResolvedValue({
            type: 'DUPLICATE_FOUND',
            existingMediaId: duplicateId,
        });
        await context.run();
        expect(context.file).toMatchObject({ status: 'DUPLICATE_PENDING', duplicateOfMediaId: duplicateId });
        expect(context.media.status).toBe('PENDING');
        expect(context.imageProcessor.inspect).not.toHaveBeenCalled();
        expect(context.imageProcessor.process).not.toHaveBeenCalled();
        expect(context.settingsService.getSettings).not.toHaveBeenCalled();
        expect(context.objects.size).toBe(1);
    });
    it('allows an explicitly accepted duplicate and stores its checksum', async () => {
        const context = setup();
        context.file.status = 'DUPLICATE_PENDING';
        context.duplicateDetectionService.detectDuplicateByChecksum.mockResolvedValue({
            type: 'DUPLICATE_FOUND',
            existingMediaId: duplicateId,
        });
        await context.run({ allowDuplicate: true });
        expect(context.media).toMatchObject({ checksum, status: 'READY' });
        expect(context.file).toMatchObject({ status: 'READY', duplicateOfMediaId: null });
    });
    it('reuses an existing checksum and generates an enabled placeholder', async () => {
        const context = setup();
        context.media.checksum = 'b'.repeat(64);
        context.settingsService.getSettings.mockResolvedValue({ mode: 'LOSSLESS', placeholderEnabled: true });
        context.variants.push({ ...context.variants[0], type: 'BLUR_PLACEHOLDER', name: 'placeholder', maxSize: 32 });
        await context.run();
        expect(context.duplicateDetectionService.detectDuplicateByChecksum).toHaveBeenCalledWith('b'.repeat(64), {
            excludeMediaId: mediaId,
        });
        expect(context.rows.has('placeholder')).toBe(true);
        expect(context.imageProcessor.process).toHaveBeenCalledWith(bytes, {
            mode: 'LOSSLESS',
            placeholderEnabled: true,
        });
    });
    it('makes a completed retry cheap and repairs an unfinished upload status', async () => {
        const context = setup();
        await context.run();
        context.file.status = 'PROCESSING';
        await context.run();
        expect(context.file.status).toBe('READY');
        expect(context.storage.read).toHaveBeenCalledTimes(1);
        expect(context.imageProcessor.process).toHaveBeenCalledTimes(1);
        expect(context.rows.size).toBe(5);
    });
    it('reuses persisted variants after an upload failure and completes a retry', async () => {
        const context = setup();
        const upload = context.storage.upload.getMockImplementation();
        context.storage.upload
            .mockImplementationOnce(upload)
            .mockRejectedValueOnce(new Error('private storage secret'));
        await expect(context.run()).rejects.toThrow('private storage secret');
        expect(context.file).toMatchObject({ status: 'FAILED', error: 'Media processing failed' });
        const savedKey = context.rows.get('optimized').storageKey;
        await context.run();
        expect(context.rows.size).toBe(5);
        expect(context.storage.upload.mock.calls.filter(([input]) => input.key === savedKey)).toHaveLength(1);
        expect(context.objects.get(context.original.storageKey)).toEqual(bytes);
        expect(context.storage.delete).not.toHaveBeenCalled();
    });
    it('uses the same object key when an upload succeeded but row registration failed', async () => {
        const context = setup();
        context.mediaVariantService.create.mockRejectedValueOnce(new Error('Database unavailable'));
        await expect(context.run()).rejects.toThrow('Database unavailable');
        const uploadedKey = context.storage.upload.mock.calls[0][0].key;
        await context.run();
        expect(context.rows.get('optimized').storageKey).toBe(uploadedKey);
        expect(context.objects.size).toBe(6);
        expect(context.media.status).toBe('READY');
    });
    it('repairs a missing derivative object without creating a second row', async () => {
        const context = setup();
        await context.run();
        context.media.status = 'FAILED';
        context.file.status = 'FAILED';
        context.objects.delete(context.rows.get('preview').storageKey);
        await context.run();
        expect(context.rows.size).toBe(5);
        expect(context.mediaVariantService.create).toHaveBeenCalledTimes(5);
        expect(context.objects.size).toBe(6);
    });
    it.each(['read', 'inspect', 'extractMetadata', 'getSettings', 'process', 'finish'])(
        'preserves the original and marks failure when %s fails',
        async (method) => {
            const context = setup();
            const owner = [context.storage, context.imageProcessor, context.settingsService, context.repository].find(
                (item) => item[method],
            );
            owner[method].mockRejectedValueOnce(new Error('Failure'));
            await expect(context.run()).rejects.toThrow('Failure');
            expect(context.media.status).toBe('FAILED');
            expect(context.file.status).toBe('FAILED');
            expect(context.objects.get(context.original.storageKey)).toEqual(bytes);
            expect(context.storage.delete).not.toHaveBeenCalled();
        },
    );
    it.each([{ mediaId: 'bad' }, { allowDuplicate: 'false' }, { extra: true }])(
        'rejects invalid payloads before side effects: %j',
        async (input) => {
            const context = setup();
            await expect(context.run(input)).rejects.toMatchObject({ code: 'INVALID_MEDIA_INPUT' });
            expect(context.repository.start).not.toHaveBeenCalled();
            expect(context.storage.read).not.toHaveBeenCalled();
        },
    );
    it('rejects mismatched or cancelled uploads without mutating either identity', async () => {
        const context = setup();
        context.file.mediaId = duplicateId;
        await expect(context.run()).rejects.toMatchObject({ code: 'INVALID_MEDIA_INPUT' });
        expect(context.repository.fail).not.toHaveBeenCalled();
        context.file.mediaId = mediaId;
        context.file.status = 'CANCELLED';
        await expect(context.run()).rejects.toMatchObject({ code: 'INVALID_MEDIA_INPUT' });
        expect(context.repository.start).not.toHaveBeenCalled();
    });
    it('marks missing originals and unsupported videos failed without generating variants', async () => {
        const context = setup();
        context.repository.findOriginal.mockResolvedValueOnce(null);
        await expect(context.run()).rejects.toThrow();
        expect(context.file.status).toBe('FAILED');
        context.media.type = 'VIDEO';
        await expect(context.run()).rejects.toThrow();
        expect(context.imageProcessor.process).not.toHaveBeenCalled();
    });
});

it('preserves admission on retry when another upload later explicitly accepts duplicate bytes', async () => {
    const context = setup();
    context.imageProcessor.process.mockRejectedValueOnce(new Error('Transient failure'));
    await expect(context.run()).rejects.toThrow('Transient failure');
    context.duplicateDetectionService.detectDuplicateByChecksum.mockResolvedValue({
        type: 'DUPLICATE_FOUND',
        existingMediaId: duplicateId,
    });
    await context.run();
    expect(context.media.status).toBe('READY');
    expect(context.file.status).toBe('READY');
    expect(context.duplicateDetectionService.detectDuplicateByChecksum).toHaveBeenCalledTimes(2);
});
