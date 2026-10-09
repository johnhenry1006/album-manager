import { createHash } from 'node:crypto';

import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { SharpImageProcessor } from '#infrastructure/image-processing/index.js';
import { ImageOptimizationSettingsService } from '#modules/settings/index.js';

import { createMediaProcessingService } from './mediaProcessing.service.js';

const mediaId = 'a0000000-0000-4000-8000-000000000001';
const uploadFileId = 'a0000000-0000-4000-8000-000000000002';
const duplicateId = 'a0000000-0000-4000-8000-000000000003';
const bytes = Buffer.from('original encoded image');
const checksum = createHash('sha256').update(bytes).digest('hex');

function setup(overrides = {}) {
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
        withMediaLock: async (_id, run) => run(mediaVariantService),
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
    Object.assign(dependencies, overrides);
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
    function videoSetup() {
        const videoProcessor = {
            inspect: vi.fn(async () => ({
                width: 320,
                height: 180,
                aspectRatio: 320 / 180,
                format: 'mp4',
                mimeType: 'video/mp4',
            })),
            extractMetadata: vi.fn(async () => ({
                duration: 2.5,
                videoCodec: 'h264',
                audioCodec: 'aac',
                frameRate: 25,
                bitrate: 100000,
            })),
            process: vi.fn(async () => ({
                variants: [
                    {
                        type: 'OPTIMIZED',
                        name: 'playback',
                        format: 'mp4',
                        contentType: 'video/mp4',
                        data: Buffer.from('playback'),
                        fileSize: 8,
                        width: 320,
                        height: 180,
                    },
                    {
                        type: 'PREVIEW',
                        name: 'preview',
                        format: 'webp',
                        contentType: 'image/webp',
                        data: Buffer.from('poster'),
                        fileSize: 6,
                        width: 320,
                        height: 180,
                    },
                ],
            })),
        };
        const context = setup({ videoProcessor });
        Object.assign(context.media, { type: 'VIDEO', mimeType: 'video/mp4' });
        context.original.format = 'mp4';
        return context;
    }
    it('processes videos through shared variants, metadata, admission and retry recovery', async () => {
        const context = videoSetup();
        context.repository.finish.mockRejectedValueOnce(new Error('Retry'));
        await expect(context.run()).rejects.toThrow('Retry');
        await context.run();
        expect(context.media).toMatchObject({ type: 'VIDEO', status: 'READY', width: 320, height: 180, checksum });
        expect(context.file.metadata).toMatchObject({ duration: 2.5, videoCodec: 'h264', audioCodec: 'aac' });
        expect([...context.rows.keys()]).toEqual(['playback', 'preview']);
        expect(context.objects.get(context.original.storageKey)).toEqual(bytes);
        expect(context.objects.size).toBe(3);
        expect(context.imageProcessor.process).not.toHaveBeenCalled();
        await context.run();
        expect(context.videoProcessor.process).toHaveBeenCalledTimes(2);
    });
    it('keeps video duplicates pending before invoking expensive decoding', async () => {
        const context = videoSetup();
        context.duplicateDetectionService.detectDuplicateByChecksum.mockResolvedValue({
            type: 'DUPLICATE_FOUND',
            existingMediaId: duplicateId,
        });
        await context.run();
        expect(context.file.status).toBe('DUPLICATE_PENDING');
        expect(context.videoProcessor.inspect).not.toHaveBeenCalled();
    });
    it('rejects a video container mismatch without publishing derivatives', async () => {
        const context = videoSetup();
        context.videoProcessor.inspect.mockResolvedValue({ format: 'webm', mimeType: 'video/webm' });
        await expect(context.run()).rejects.toThrow('Decoded media type');
        expect(context.file.status).toBe('FAILED');
        expect(context.rows.size).toBe(0);
        expect(context.videoProcessor.process).not.toHaveBeenCalled();
    });
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
    it('marks missing originals and unavailable video processors failed without generating variants', async () => {
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

it('uses fresh persisted settings for subsequent worker jobs while preserving originals', async () => {
    let value = {};
    const repository = {
        findByKey: async () => ({ key: 'imageOptimization', value }),
        upsert: async (_key, updated) => {
            value = updated;
        },
        withSettingsLock: async (_key, run) => run(repository),
    };
    const settingsService = new ImageOptimizationSettingsService({ repository });
    const imageProcessor = new SharpImageProcessor();
    const input = await sharp({ create: { width: 400, height: 200, channels: 3, background: 'red' } })
        .png()
        .toBuffer();
    const first = setup({ settingsService, imageProcessor });
    first.original.format = 'png';
    first.objects.set(first.original.storageKey, input);
    await first.run();
    expect(first.rows.get('optimized')).toMatchObject({ width: 400, height: 200, quality: 80 });
    await settingsService.patchSettings({
        optimizedMaxWidth: 300,
        optimizedMaxHeight: 100,
        previewMaxWidth: 80,
        optimizationMode: 'HIGH_QUALITY',
        highQuality: 94,
        thumbnailSizes: [40],
    });
    const second = setup({ settingsService, imageProcessor });
    second.original.format = 'png';
    second.objects.set(second.original.storageKey, input);
    await second.run();
    expect(second.rows.get('optimized')).toMatchObject({ width: 200, height: 100, quality: 94 });
    expect(second.rows.get('preview')).toMatchObject({ width: 80, height: 40, quality: 94 });
    expect(second.rows.has('thumbnail-40')).toBe(true);
    expect(second.objects.get(second.original.storageKey)).toEqual(input);
    expect(second.media.status).toBe('READY');
});

it('rejects decoded image MIME mismatches before generating or publishing variants', async () => {
    const context = setup();
    context.media.mimeType = 'image/jpeg';
    context.imageProcessor.inspect.mockResolvedValue({
        width: 100,
        height: 50,
        aspectRatio: 2,
        format: 'png',
        mimeType: 'image/png',
    });
    await expect(context.run()).rejects.toThrow();
    expect(context.imageProcessor.process).not.toHaveBeenCalled();
    expect(context.repository.finish).not.toHaveBeenCalled();
    expect(context.file.status).toBe('FAILED');
});

it.each(['inspect', 'extractMetadata', 'process'])(
    'does not publish READY or derivatives when the processor %s fails',
    async (method) => {
        const context = setup();
        context.imageProcessor[method].mockRejectedValueOnce(new Error('Processor unavailable'));
        await expect(context.run()).rejects.toThrow('Processor unavailable');
        expect(context.repository.finish).not.toHaveBeenCalled();
        expect(context.storage.upload).not.toHaveBeenCalled();
        expect(context.mediaVariantService.create).not.toHaveBeenCalled();
        expect(context.file.status).toBe('FAILED');
        if (method !== 'process') expect(context.imageProcessor.process).not.toHaveBeenCalled();
    },
);

it('accepts a real AVIF source while validating its decoded container type', async () => {
    const input = await sharp({ create: { width: 16, height: 8, channels: 3, background: 'red' } })
        .avif()
        .toBuffer();
    const settingsService = new ImageOptimizationSettingsService({ repository: { findByKey: async () => null } });
    const context = setup({ imageProcessor: new SharpImageProcessor(), settingsService });
    context.media.mimeType = 'image/avif';
    context.original.format = 'avif';
    context.objects.set(context.original.storageKey, input);
    await context.run();
    expect(context.file.status).toBe('READY');
    expect(context.media.mimeType).toBe('image/avif');
});
