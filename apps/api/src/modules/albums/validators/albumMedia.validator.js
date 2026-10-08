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
    const data = validateQuery(input, ['limit', 'cursor']);
    return {
        limit: validatePositiveInteger(data.limit, Math.min(50, maxLimit), maxLimit),
        ...(data.cursor === undefined ? {} : { cursor: decodeAlbumMediaCursor(data.cursor, albumId) }),
    };
}
