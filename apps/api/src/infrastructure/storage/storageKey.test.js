import { describe, expect, it } from 'vitest';

import { generateStorageKey } from './storageKey.js';

const input = {
    id: 'f164b995-4b79-47c1-96cd-0dab2d6f5850',
    createdAt: new Date('2026-10-08T00:15:00+07:00'),
    filename: 'My photo.jpg',
};

describe('storage keys', () => {
    it('uses UTC, a stable UUID, and sanitized filename without album data', () => {
        expect(generateStorageKey({ ...input, albumName: 'Vacation' })).toBe(
            'media/2026/10/07/f164b995-4b79-47c1-96cd-0dab2d6f5850/original/My_photo.jpg',
        );
        expect(generateStorageKey({ ...input, albumName: 'Renamed' })).toBe(generateStorageKey(input));
    });
    it.each([
        ['ORIGINAL', 'original'],
        ['OPTIMIZED', 'optimized'],
        ['PREVIEW', 'preview'],
        ['THUMBNAIL', 'thumbnails'],
        ['BLUR_PLACEHOLDER', 'preview'],
    ])('maps %s to %s', (variant, directory) => {
        expect(generateStorageKey({ ...input, variant })).toContain(`/${directory}/My_photo.jpg`);
    });
    it.each(['../../My photo.jpg', 'C:\\fakepath\\My photo.jpg'])('strips client path components: %s', (filename) => {
        expect(generateStorageKey({ ...input, filename })).toBe(generateStorageKey(input));
    });
    it('bounds filenames while preserving the extension', () => {
        const filename = generateStorageKey({ ...input, filename: `${'a'.repeat(1000)}.jpeg` })
            .split('/')
            .at(-1);
        expect(filename.length).toBeLessThanOrEqual(180);
        expect(filename.endsWith('.jpeg')).toBe(true);
    });
    it.each([
        { id: '../bad' },
        { createdAt: new Date('invalid') },
        { createdAt: undefined },
        { filename: '' },
        { filename: '..' },
        { filename: 'bad\u0000.jpg' },
        { variant: 'unknown' },
    ])('rejects invalid input: %j', (invalid) => {
        expect(() => generateStorageKey({ ...input, ...invalid })).toThrow(TypeError);
    });
});
