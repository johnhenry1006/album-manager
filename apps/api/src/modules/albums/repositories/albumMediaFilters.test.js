import { expect, it, vi } from 'vitest';

import { validateAlbumMediaQuery } from '../validators/albumMedia.validator.js';
import { decodeAlbumMediaCursor, encodeAlbumMediaCursor } from '../validators/albumMediaCursor.js';
import { createAlbumMediaRepository } from './albumMedia.repository.js';

const id = 'a0000000-0000-4000-8000-000000000001';
const row = { id: 'c0000000-0000-4000-8000-000000000001', position: 5 };
it('validates search/type/favorite and combines filters with membership ordering', async () => {
    const query = validateAlbumMediaQuery({ q: ' Photo_% ', type: 'IMAGE', favorite: 'false' }, id);
    expect(query).toMatchObject({ q: 'Photo_%', type: 'IMAGE', favorite: false });
    const findMany = vi.fn(async () => []);
    await createAlbumMediaRepository({ albumMedia: { findMany } }).findMediaPage(
        id,
        query,
        '00000000-0000-4000-8000-000000000001',
    );
    expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
            where: {
                albumId: id,
                media: {
                    deletedAt: null,
                    type: 'IMAGE',
                    favorites: { none: { userId: '00000000-0000-4000-8000-000000000001' } },
                    originalFilename: { contains: 'Photo\\_\\%', mode: 'insensitive' },
                },
            },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            take: 51,
        }),
    );
});
it('binds filtered cursors to normalized filters while keeping unfiltered cursors compatible', () => {
    const filters = { q: '猫'.repeat(255), type: 'IMAGE', favorite: false };
    const cursor = encodeAlbumMediaCursor(row, id, filters);
    expect(decodeAlbumMediaCursor(cursor, id, filters)).toMatchObject(row);
    expect(() => decodeAlbumMediaCursor(cursor, id, { ...filters, favorite: true })).toThrow();
    expect(() => decodeAlbumMediaCursor(cursor, id)).toThrow();
    expect(decodeAlbumMediaCursor(encodeAlbumMediaCursor(row, id), id)).toMatchObject(row);
});
it.each([{ type: 'AUDIO' }, { favorite: 'yes' }, { q: '' }, { q: 'a\nb' }])(
    'rejects invalid album media filters %j',
    (filters) => {
        expect(() => validateAlbumMediaQuery(filters, id)).toThrow();
    },
);
