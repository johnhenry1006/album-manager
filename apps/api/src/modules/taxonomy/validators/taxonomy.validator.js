import {
    validateId,
    validateNameSlug,
    validateObject,
    validatePositiveInteger,
} from '#shared/validation/entityInput.js';

import { invalid } from '../services/taxonomy.errors.js';

export function validateTaxonomy(input, kind, { create = false } = {}) {
    const data = validateObject(input, kind === 'categories' ? ['name', 'slug', 'parentId'] : ['name', 'slug']);
    if ((create && !Object.hasOwn(data, 'name')) || (!create && !Object.keys(data).length))
        throw invalid('Missing taxonomy metadata');
    validateNameSlug(data);
    if (Object.hasOwn(data, 'parentId') && data.parentId !== null) data.parentId = validateId(data.parentId);
    return data;
}

export function validateList(input = {}, kind) {
    const data = validateObject(input, kind === 'categories' ? ['page', 'limit', 'q', 'tree'] : ['page', 'limit', 'q']);
    if (Object.values(data).some((value) => typeof value !== 'string')) throw invalid('Expected scalar query values');
    if (data.tree !== undefined && !['true', 'false'].includes(data.tree)) throw invalid('Invalid tree option');
    if (data.tree === 'true') {
        if (['page', 'limit', 'q'].some((field) => data[field] !== undefined))
            throw invalid('Tree cannot be filtered or paginated');
        return { tree: true };
    }
    const page = validatePositiveInteger(data.page, 1, 2147483647);
    const limit = validatePositiveInteger(data.limit, 50, 200);
    if ((page - 1) * limit > 2147483647) throw invalid('Page offset too large');
    const query = { page, limit };
    if (data.q !== undefined) {
        const q = data.q.trim();
        if (!q || q.length > 255 || /[\r\n\0]/.test(q)) throw invalid('Invalid search');
        query.q = q;
    }
    return query;
}

export { validateId, validateObject };
