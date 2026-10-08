import { invalid } from '../services/album.errors.js';

export function validateAlbumId(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))
        throw invalid('Expected a UUID');
    return value.toLowerCase();
}

export function validateObject(input, fields) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !fields.includes(key))
    )
        throw invalid('Invalid input fields');
    return { ...input };
}

export function validateAlbum(input, { create = false } = {}) {
    const data = validateObject(input, ['name', 'slug', 'description', 'visibility', 'coverMediaId']);
    if ((create && !Object.hasOwn(data, 'name')) || (!create && !Object.keys(data).length))
        throw invalid('Missing album metadata');
    if (Object.hasOwn(data, 'name')) {
        if (
            typeof data.name !== 'string' ||
            !data.name.trim() ||
            data.name.trim().length > 255 ||
            /[\r\n\0]/.test(data.name)
        )
            throw invalid('Invalid name');
        data.name = data.name.trim();
    }
    if (
        Object.hasOwn(data, 'slug') &&
        (typeof data.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) || data.slug.length > 255)
    )
        throw invalid('Invalid slug');
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

export function validateQuery(input, fields) {
    const data = validateObject(input, fields);
    if (Object.values(data).some((value) => typeof value !== 'string')) throw invalid('Expected scalar query values');
    return data;
}

export function validatePositiveInteger(value, fallback, max) {
    if (value === undefined) return fallback;
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > max)
        throw invalid('Invalid pagination');
    return number;
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
