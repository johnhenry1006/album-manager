import { mediaThumbnailQuery } from './mediaThumbnail.query.js';

function afterCursor({ sort, order, cursor }) {
    const field = sort === 'filename' ? 'originalFilename' : sort;
    const compare = order === 'asc' ? 'gt' : 'lt';
    if (sort === 'takenAt' && cursor.value === null) return { takenAt: null, id: { [compare]: cursor.id } };
    return {
        OR: [
            { [field]: { [compare]: cursor.value } },
            { [field]: cursor.value, id: { [compare]: cursor.id } },
            ...(sort === 'takenAt' ? [{ takenAt: null }] : []),
        ],
    };
}

function filters(query) {
    const where = { deletedAt: null };
    const and = [];
    for (const field of ['type', 'status', 'mimeType']) {
        if (query[field] !== undefined) where[field] = query[field];
    }
    if (query.favorite !== undefined) where.favorite = query.favorite ? { isNot: null } : { is: null };
    if (query.category !== undefined) where.categories = { some: { categoryId: query.category } };
    if (query.tag !== undefined) where.tags = { some: { tagId: query.tag } };
    if (query.album !== undefined) where.albums = { some: { albumId: query.album, album: { deletedAt: null } } };
    for (const field of ['takenAt', 'createdAt']) {
        if (query[`${field}From`] !== undefined || query[`${field}To`] !== undefined) {
            where[field] = {
                ...(query[`${field}From`] === undefined ? {} : { gte: query[`${field}From`] }),
                ...(query[`${field}To`] === undefined ? {} : { lte: query[`${field}To`] }),
            };
        }
    }
    if (query.q !== undefined) {
        // Prisma's contains uses LIKE; escape wildcard characters to search literal text.
        const text = { contains: query.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' };
        and.push({
            OR: [
                { originalFilename: text },
                { tags: { some: { tag: { name: text } } } },
                { categories: { some: { category: { name: text } } } },
                { albums: { some: { album: { deletedAt: null, OR: [{ name: text }, { description: text }] } } } },
            ],
        });
    }
    if (query.cursor) and.push(afterCursor(query));
    if (and.length) where.AND = and;
    return where;
}

// Consumes the validated list query; owns filtering, keyset ordering and gallery projection.
export function buildMediaListQuery(query) {
    const field = query.sort === 'filename' ? 'originalFilename' : query.sort;
    return {
        where: filters(query),
        orderBy: [
            { [field]: query.sort === 'takenAt' ? { sort: query.order, nulls: 'last' } : query.order },
            { id: query.order },
        ],
        take: query.limit + 1,
        select: {
            id: true,
            type: true,
            originalFilename: true,
            width: true,
            height: true,
            aspectRatio: true,
            takenAt: true,
            ...(query.sort === 'createdAt' ? { createdAt: true } : {}),
            favorite: { select: { id: true } },
            variants: mediaThumbnailQuery,
        },
    };
}
