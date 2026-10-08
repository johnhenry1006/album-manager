import { describe, expect, it } from 'vitest';

import { createMediaGalleryItem } from './mediaGallery.service.js';

const record = {
    id: 'media-id',
    type: 'IMAGE',
    originalFilename: 'photo.jpg',
    width: null,
    height: null,
    aspectRatio: null,
    favorite: null,
    takenAt: null,
    variants: [{ name: 'small', format: 'webp', width: 100, height: 75, storageKey: 'thumb.webp' }],
    metadata: { private: true },
};

describe('shared gallery projection', () => {
    it('signs thumbnail references through the provider and projects compact fields', async () => {
        const storage = {
            createPresignedDownloadUrl: async ({ key, expiresIn }) => ({
                url: `https://assets.example/${key}?expires=${expiresIn}`,
            }),
        };
        const item = await createMediaGalleryItem(record, { storage, urlExpirySeconds: 900 });
        expect(item.thumbnails).toEqual([
            {
                name: 'small',
                format: 'webp',
                width: 100,
                height: 75,
                url: 'https://assets.example/thumb.webp?expires=900',
            },
        ]);
        expect(item.favorite).toBe(false);
        expect(item).not.toHaveProperty('metadata');
        expect(item).not.toHaveProperty('variants');
    });
    it('does not require storage when no thumbnail exists', async () => {
        expect(await createMediaGalleryItem({ ...record, variants: [] }, {})).toMatchObject({ thumbnails: [] });
    });
});
