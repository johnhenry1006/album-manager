import { invalid } from '../services/taxonomy.errors.js';
import { validateId, validateObject } from './taxonomy.validator.js';

export const assignmentField = (kind) => (kind === 'categories' ? 'categoryIds' : 'tagIds');

function ids(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw invalid('Expected 1–100 IDs');
    // Array.from also rejects sparse array entries for direct service callers.
    return [...new Set(Array.from(value, validateId))].sort();
}

export function validateAssignment(input, kind, mediaId) {
    const field = assignmentField(kind);
    const data = validateObject(input, mediaId === undefined ? ['mediaIds', field] : [field]);
    return { mediaIds: mediaId === undefined ? ids(data.mediaIds) : [validateId(mediaId)], [field]: ids(data[field]) };
}
