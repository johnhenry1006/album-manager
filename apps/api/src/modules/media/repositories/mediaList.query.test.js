import { describe, expect, it } from 'vitest';

import { buildMediaListQuery } from './mediaList.query.js';

const id = 'a0000000-0000-4000-8000-000000000001';
const date = new Date('2026-01-01T00:00:00Z');

describe('media list query specification', () => {
    it('intersects text search and cursor alternatives with every scalar, relation and date filter', () => {
        const query = buildMediaListQuery(
            {
                limit: 1,
                sort: 'createdAt',
                order: 'desc',
                q: 'Beach_%',
                type: 'IMAGE',
                mimeType: 'image/jpeg',
                status: 'READY',
                favorite: true,
                album: id,
                category: id,
                tag: id,
                takenAtFrom: date,
                takenAtTo: date,
                createdAtFrom: date,
                createdAtTo: date,
                cursor: { value: date, id },
            },
            '00000000-0000-4000-8000-000000000001',
        );
        const text = { contains: 'Beach\\_\\%', mode: 'insensitive' };
        expect(query.where).toEqual({
            deletedAt: null,
            type: 'IMAGE',
            mimeType: 'image/jpeg',
            status: 'READY',
            favorites: { some: { userId: '00000000-0000-4000-8000-000000000001' } },
            albums: { some: { albumId: id, album: { deletedAt: null } } },
            categories: { some: { categoryId: id } },
            tags: { some: { tagId: id } },
            takenAt: { gte: date, lte: date },
            createdAt: { gte: date, lte: date },
            AND: [
                {
                    OR: [
                        { originalFilename: text },
                        { tags: { some: { tag: { name: text } } } },
                        { categories: { some: { category: { name: text } } } },
                        {
                            albums: {
                                some: { album: { deletedAt: null, OR: [{ name: text }, { description: text }] } },
                            },
                        },
                    ],
                },
                { OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: id } }] },
            ],
        });
        expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
        expect(query.take).toBe(2);
        expect(query.select).not.toHaveProperty('metadata');
        expect(query.select.variants.where).toEqual({ type: 'THUMBNAIL' });
    });

    it.each(['asc', 'desc'])('keeps null taken dates last in %s order and continues null ties by id', (order) => {
        const query = buildMediaListQuery(
            {
                limit: 2,
                sort: 'takenAt',
                order,
                favorite: false,
                cursor: { value: null, id },
            },
            '00000000-0000-4000-8000-000000000001',
        );
        expect(query.orderBy).toEqual([{ takenAt: { sort: order, nulls: 'last' } }, { id: order }]);
        expect(query.where).toEqual({
            deletedAt: null,
            favorites: { none: { userId: '00000000-0000-4000-8000-000000000001' } },
            AND: [{ takenAt: null, id: { [order === 'asc' ? 'gt' : 'lt']: id } }],
        });
    });
});
