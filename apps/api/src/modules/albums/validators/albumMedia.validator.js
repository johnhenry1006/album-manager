import { invalid } from '../services/album.errors.js';
import { validateAlbumId, validateObject, validatePositiveInteger, validateQuery } from './album.validator.js';
import { decodeAlbumMediaCursor, validatePosition } from './albumMediaCursor.js';

export function validateAlbumMembership(input) {
    const data = validateObject(input, ['mediaId', 'position']);
    data.mediaId = validateAlbumId(data.mediaId);
    if (Object.hasOwn(data, 'position')) validatePosition(data.position);
    return data;
}

export function validateAlbumMediaQuery(input = {}, albumId, { maxLimit = 200 } = {}) {
    maxLimit = Math.min(200, maxLimit);
    const data = validateQuery(input, ['limit', 'cursor', 'q', 'type', 'favorite']);
    const query = { limit: Math.min(validatePositiveInteger(data.limit, Math.min(50, maxLimit), 200), maxLimit) };
    if (data.q !== undefined) {
        const text = data.q.trim();
        if (!text || text.length > 255 || /[\r\n\0]/.test(text)) throw invalid('Invalid search');
        query.q = text;
    }
    if (data.type !== undefined) {
        if (!['IMAGE', 'VIDEO'].includes(data.type)) throw invalid('Invalid type');
        query.type = data.type;
    }
    if (data.favorite !== undefined) {
        if (!['true', 'false'].includes(data.favorite)) throw invalid('Invalid favorite');
        query.favorite = data.favorite === 'true';
    }
    if (data.cursor !== undefined) query.cursor = decodeAlbumMediaCursor(data.cursor, albumId, query);
    return query;
}
