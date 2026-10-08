import sharp from 'sharp';
import { expect, it } from 'vitest';

import { ImageOptimizationSettingsService } from '#modules/settings/index.js';

import { SharpImageProcessor } from './sharpImageProcessor.js';

async function options(overrides = {}) {
    return new ImageOptimizationSettingsService({
        repository: { findByKey: async () => ({ value: overrides }) },
    }).getSettings();
}
it('normalizes EXIF orientation, produces every default variant, and leaves original bytes intact', async () => {
    const source = await sharp({ create: { width: 3000, height: 1800, channels: 3, background: '#5498bf' } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
    const original = Buffer.from(source);
    const processor = new SharpImageProcessor();
    expect(await processor.inspect(source)).toMatchObject({ width: 1800, height: 3000, aspectRatio: 0.6 });
    const result = await processor.process(source, await options());
    expect(result.variants.map(({ type, maxSize, width, height }) => ({ type, maxSize, width, height }))).toEqual([
        { type: 'OPTIMIZED', maxSize: 2560, width: 1536, height: 2560 },
        { type: 'PREVIEW', maxSize: 1600, width: 960, height: 1600 },
        { type: 'THUMBNAIL', maxSize: 800, width: 480, height: 800 },
        { type: 'THUMBNAIL', maxSize: 400, width: 240, height: 400 },
        { type: 'THUMBNAIL', maxSize: 200, width: 120, height: 200 },
    ]);
    for (const variant of result.variants) {
        expect(await sharp(variant.data).metadata()).toMatchObject({
            format: 'webp',
            width: variant.width,
            height: variant.height,
        });
        expect((await sharp(variant.data).metadata()).orientation).toBeUndefined();
        expect(variant.fileSize).toBe(variant.data.length);
        expect(variant.losslessEncoding).toBe(false);
    }
    expect(source).toEqual(original);
});
it('does not upscale and optionally generates a tiny placeholder', async () => {
    const input = await sharp({ create: { width: 100, height: 50, channels: 4, background: '#ab78d0' } })
        .png()
        .toBuffer();
    const result = await new SharpImageProcessor().process(input, await options({ placeholderEnabled: true }));
    expect(result.variants).toHaveLength(6);
    expect(result.variants[0]).toMatchObject({ width: 100, height: 50 });
    expect(result.variants.at(-1)).toMatchObject({ type: 'BLUR_PLACEHOLDER', width: 32, height: 16 });
});
it('LOSSLESS preserves processed pixel values when no resizing is needed', async () => {
    const pixels = Buffer.from([255, 20, 32, 10, 220, 64, 11, 33, 245, 127, 54, 210]);
    const input = await sharp(pixels, { raw: { width: 2, height: 2, channels: 3 } })
        .png()
        .toBuffer();
    const result = await new SharpImageProcessor().process(input, await options({ mode: 'LOSSLESS' }));
    expect(await sharp(result.variants[0].data).raw().toBuffer()).toEqual(pixels);
    expect(result.variants[0]).toMatchObject({ losslessEncoding: true, quality: null });
});
it('rejects malformed bytes with a sanitized processing error', async () => {
    const processor = new SharpImageProcessor();
    await expect(processor.process(Buffer.from('private invalid payload'), await options())).rejects.toMatchObject({
        code: 'IMAGE_PROCESSING_FAILED',
        statusCode: 422,
    });
});
it('accepts encoded buffers only and requires normalized options', async () => {
    const processor = new SharpImageProcessor();
    await expect(processor.inspect('/private/path.jpg')).rejects.toThrow(TypeError);
    await expect(processor.process(Buffer.from('x'), { mode: 'BALANCED' })).rejects.toThrow(TypeError);
});
it('enforces the configured decoded-pixel limit before processing', async () => {
    const input = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } })
        .png()
        .toBuffer();
    await expect(new SharpImageProcessor({ limitInputPixels: 100 }).inspect(input)).rejects.toMatchObject({
        code: 'IMAGE_PROCESSING_FAILED',
    });
});
