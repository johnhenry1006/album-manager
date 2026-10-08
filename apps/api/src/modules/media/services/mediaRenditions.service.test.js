import { expect, it, vi } from 'vitest';

import { createMediaRenditionsService } from './mediaRenditions.service.js';

it('refuses rendition writes after trashing the media, before any storage operation', async () => {
    const storage = { exists: vi.fn(), upload: vi.fn() };
    const mediaVariantService = {
        withMediaLock: vi.fn(async () => {
            throw Object.assign(new Error('Media not found'), { code: 'MEDIA_NOT_FOUND' });
        }),
        findByIdentity: vi.fn(async () => null),
        create: vi.fn(),
    };
    const service = createMediaRenditionsService({ storage, mediaVariantService });
    await expect(
        service.persist(
            { id: 'c0000000-0000-4000-8000-000000000001', createdAt: new Date('2026-01-01') },
            { storageKey: 'source.jpg' },
            [
                {
                    type: 'THUMBNAIL',
                    name: 'small',
                    format: 'webp',
                    data: Buffer.from('image'),
                    contentType: 'image/webp',
                    fileSize: 5,
                },
            ],
        ),
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
    expect(storage.exists).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
});
