import {
    validateId as validateAlbumId,
    validateNameSlug,
    validateObject,
    validatePositiveInteger,
    validateQuery,
} from '#shared/validation/entityInput.js';

import { invalid } from '../services/album.errors.js';

export function validateAlbum(input, { create = false } = {}) {
    const data = validateObject(input, ['name', 'slug', 'description', 'visibility', 'coverMediaId']);
    if ((create && !Object.hasOwn(data, 'name')) || (!create && !Object.keys(data).length))
        throw invalid('Missing album metadata');
    validateNameSlug(data);
    if (
        Object.hasOwn(data, 'description') &&
        data.description !== null &&
        (typeof data.description !== 'string' || data.description.length > 5000 || /\0/.test(data.description))
    )
        throw invalid('Invalid description');
    if (Object.hasOwn(data, 'visibility') && !['PRIVATE', 'PUBLIC'].includes(data.visibility))
        throw invalid('Invalid visibility');
    if (Object.hasOwn(data, 'coverMediaId') && data.coverMediaId !== null) {
        data.coverMediaId = validateAlbumId(data.coverMediaId);
        if (create) throw invalid('Add media before assigning a cover');
    }
    return data;
}

export function validateAlbumListQuery(input = {}, { maxLimit = 200 } = {}) {
    maxLimit = Math.min(200, maxLimit);
    const data = validateQuery(input, ['page', 'limit', 'q']);
    const page = validatePositiveInteger(data.page, 1, 2147483647);
    const limit = validatePositiveInteger(data.limit, Math.min(50, maxLimit), maxLimit);
    if ((page - 1) * limit > 2147483647) throw invalid('Page offset too large');
    const query = { page, limit };
    if (data.q !== undefined) {
        const text = data.q.trim();
        if (!text || text.length > 255 || /[\r\n\0]/.test(text)) throw invalid('Invalid search');
        query.q = text;
    }
    return query;
}

export { validateAlbumId, validateObject, validatePositiveInteger, validateQuery };
