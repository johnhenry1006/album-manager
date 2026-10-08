import { invalid } from '../services/media.errors.js';
import { validateId } from './media.validator.js';
import { decodeMediaListCursor } from './mediaListCursor.js';

export const TRASH_ORDER = Object.freeze({ sort: 'deletedAt', order: 'desc' });

export function validateTrashMutation(id, query = {}, body, { permanent = false } = {}) {
    validateId(id);
    if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).length)
        throw invalid('This endpoint does not accept query parameters');
    if (permanent) {
        if (
            !body ||
            typeof body !== 'object' ||
            Array.isArray(body) ||
            Object.keys(body).join(',') !== 'confirm' ||
            body.confirm !== true
        )
            throw invalid('Explicit permanent deletion confirmation is required');
    } else if (body !== undefined) throw invalid('This endpoint does not accept a request body');
    return id;
}

export function validateTrashQuery(input = {}, { maxLimit = 200 } = {}) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !['limit', 'cursor'].includes(key)) ||
        Object.values(input).some((value) => typeof value !== 'string')
    )
        throw invalid('Invalid trash query');
    const limit = input.limit === undefined ? Math.min(50, maxLimit) : Number(input.limit);
    if (
        (input.limit !== undefined && !/^\d+$/.test(input.limit)) ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > maxLimit
    )
        throw invalid('Invalid page size');
    return {
        limit,
        ...(input.cursor === undefined ? {} : { cursor: decodeMediaListCursor(input.cursor, TRASH_ORDER) }),
    };
}

export function validateRetentionCleanup(input, now) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !['before', 'limit'].includes(key))
    )
        throw invalid('Invalid retention cleanup input');
    const { before, limit = 50 } = input;
    if (
        !(before instanceof Date) ||
        !Number.isFinite(before.getTime()) ||
        before > now ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 200
    )
        throw invalid('Invalid retention cutoff or batch size');
    return { before: new Date(before), limit };
}
