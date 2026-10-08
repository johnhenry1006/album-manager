import { describe, expect, it } from 'vitest';

import { buildVariantSpecifications, calculateDimensions, selectWebpConfig } from './imageProcessing.utils.js';

const options = {
    mode: 'BALANCED',
    format: 'webp',
    optimizedMaxSize: 2560,
    previewMaxSize: 1600,
    thumbnailSizes: [800, 400, 200],
    placeholderEnabled: false,
    placeholderMaxSize: 32,
};

describe('aspect preserving dimensions', () => {
    it.each([
        [{ width: 6000, height: 4000 }, 2560, { width: 2560, height: 1707 }],
        [{ width: 4000, height: 6000 }, 1600, { width: 1067, height: 1600 }],
        [{ width: 4000, height: 4000 }, 800, { width: 800, height: 800 }],
        [{ width: 80, height: 40 }, 200, { width: 80, height: 40 }],
        [{ width: 10000, height: 1 }, 200, { width: 200, height: 1 }],
        [{ width: 6000, height: 4000, orientation: 6 }, 2560, { width: 1707, height: 2560 }],
        [{ width: 6000, height: 4000, orientation: 5 }, 2560, { width: 1707, height: 2560 }],
        [{ width: 6000, height: 4000, orientation: 8 }, 2560, { width: 1707, height: 2560 }],
        [{ width: 6000, height: 4000, orientation: 2 }, 2560, { width: 2560, height: 1707 }],
    ])('fits %j within %i without upscaling', (input, limit, dimensions) => {
        expect(calculateDimensions(input, limit)).toEqual(dimensions);
    });
    it.each([
        { width: 0, height: 1 },
        { width: 1.5, height: 1 },
        { width: 1, height: NaN },
        { width: 1, height: 1, orientation: 9 },
    ])('rejects invalid image metadata %j', (input) => {
        expect(() => calculateDimensions(input, 800)).toThrow(TypeError);
    });
});
describe('mode and rendition selection', () => {
    it('defaults encoder selection to balanced lossy WebP', () => {
        expect(selectWebpConfig()).toMatchObject({ quality: 80, lossless: false, nearLossless: false });
    });
    it.each([
        ['LOSSLESS', 100, true],
        ['BALANCED', 80, false],
        ['HIGH_QUALITY', 90, false],
        ['MAX_COMPRESSION', 60, false],
    ])('selects explicit %s encoder behavior', (mode, quality, lossless) => {
        expect(selectWebpConfig(mode)).toMatchObject({ quality, lossless, nearLossless: false });
    });
    it('does not accept unknown or misleading mode names', () => {
        expect(() => selectWebpConfig('VISUALLY_LOSSLESS')).toThrow(TypeError);
    });
    it('generates all sizes with distinct rendition identities', () => {
        expect(buildVariantSpecifications(options)).toEqual([
            { type: 'OPTIMIZED', name: 'optimized', maxSize: 2560 },
            { type: 'PREVIEW', name: 'preview', maxSize: 1600 },
            { type: 'THUMBNAIL', name: 'thumbnail-800', maxSize: 800 },
            { type: 'THUMBNAIL', name: 'thumbnail-400', maxSize: 400 },
            { type: 'THUMBNAIL', name: 'thumbnail-200', maxSize: 200 },
        ]);
    });
    it('generates a tiny placeholder only when enabled', () => {
        expect(buildVariantSpecifications({ ...options, placeholderEnabled: true }).at(-1)).toEqual({
            type: 'BLUR_PLACEHOLDER',
            name: 'placeholder',
            maxSize: 32,
        });
    });
    it('requires complete normalized processing options instead of loading defaults', () => {
        expect(() => buildVariantSpecifications({ mode: 'BALANCED' })).toThrow(TypeError);
        expect(() => buildVariantSpecifications({ ...options, thumbnailSizes: [800, 800] })).toThrow(TypeError);
    });
});
