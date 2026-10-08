import { invalid } from '../services/media.errors.js';
import { validateId, validateStatus } from './media.validator.js';
import { decodeMediaListCursor } from './mediaListCursor.js';

const QUERY_FIELDS = [
    'limit',
    'cursor',
    'sort',
    'order',
    'q',
    'type',
    'status',
    'favorite',
    'category',
    'tag',
    'album',
    'takenAtFrom',
    'takenAtTo',
    'createdAtFrom',
    'createdAtTo',
    'mimeType',
];

// Require an explicit timezone and millisecond precision compatible with persisted timestamps.
export function validateListDate(value) {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    )
        throw invalid('Invalid date');
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    const date = new Date(value);
    if (
        !Number.isFinite(date.getTime()) ||
        calendar.getUTCFullYear() !== year ||
        calendar.getUTCMonth() + 1 !== month ||
        calendar.getUTCDate() !== day ||
        Number(value.slice(11, 13)) > 23
    )
        throw invalid('Invalid date');
    return date;
}

export function validateMediaListQuery(input = {}, { maxLimit = 200 } = {}) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !QUERY_FIELDS.includes(key))
    )
        throw invalid('Invalid media query');
    if (Object.values(input).some((value) => typeof value !== 'string')) throw invalid('Invalid query value');
    const limit = input.limit === undefined ? Math.min(50, maxLimit) : Number(input.limit);
    if (
        (input.limit !== undefined && !/^\d+$/.test(input.limit)) ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > maxLimit
    )
        throw invalid('Invalid page size');
    const sort = input.sort ?? 'createdAt';
    const order = input.order ?? 'desc';
    if (!['createdAt', 'takenAt', 'filename'].includes(sort) || !['asc', 'desc'].includes(order))
        throw invalid('Invalid ordering');
    const query = { limit, sort, order };
    if (input.q !== undefined) {
        const text = input.q.trim();
        if (!text || text.length > 255 || /[\r\n\0]/.test(text)) throw invalid('Invalid search text');
        query.q = text;
    }
    if (input.type !== undefined) {
        if (!['IMAGE', 'VIDEO'].includes(input.type)) throw invalid('Invalid type');
        query.type = input.type;
    }
    if (input.status !== undefined) query.status = validateStatus(input.status);
    if (input.favorite !== undefined) {
        if (!['true', 'false'].includes(input.favorite)) throw invalid('Invalid favorite');
        query.favorite = input.favorite === 'true';
    }
    for (const field of ['category', 'tag', 'album']) {
        if (input[field] !== undefined) query[field] = validateId(input[field]);
    }
    if (input.mimeType !== undefined) {
        if (!/^[\w.+-]+\/[\w.+-]+$/.test(input.mimeType) || input.mimeType.length > 127)
            throw invalid('Invalid MIME type');
        query.mimeType = input.mimeType.toLowerCase();
    }
    for (const field of ['takenAt', 'createdAt']) {
        const from = input[`${field}From`];
        const to = input[`${field}To`];
        if (from !== undefined) query[`${field}From`] = validateListDate(from);
        if (to !== undefined) query[`${field}To`] = validateListDate(to);
        if (from !== undefined && to !== undefined && query[`${field}From`] > query[`${field}To`])
            throw invalid('Invalid date range');
    }
    if (input.cursor !== undefined) query.cursor = decodeMediaListCursor(input.cursor, { sort, order });
    return query;
}
