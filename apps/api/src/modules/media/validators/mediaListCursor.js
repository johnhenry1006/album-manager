import { invalid } from '../services/media.errors.js';
import { validateId } from './media.validator.js';

export function encodeMediaListCursor(record, { sort, order }) {
    const field = sort === 'filename' ? 'originalFilename' : sort;
    const value = record[field] instanceof Date ? record[field].toISOString() : record[field];
    return Buffer.from(JSON.stringify({ v: 1, sort, order, value, id: record.id })).toString('base64url');
}

export function decodeMediaListCursor(encoded, { sort, order }) {
    try {
        if (typeof encoded !== 'string' || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded))
            throw invalid('Invalid cursor');
        const bytes = Buffer.from(encoded, 'base64url');
        if (bytes.toString('base64url') !== encoded) throw invalid('Invalid cursor');
        const cursor = JSON.parse(bytes.toString('utf8'));
        if (
            !cursor ||
            Object.keys(cursor).sort().join(',') !== 'id,order,sort,v,value' ||
            cursor.v !== 1 ||
            cursor.sort !== sort ||
            cursor.order !== order
        )
            throw invalid('Invalid cursor');
        validateId(cursor.id);
        if (sort === 'filename') {
            if (typeof cursor.value !== 'string' || !cursor.value || /[\r\n\0]/.test(cursor.value))
                throw invalid('Invalid cursor');
        } else if (cursor.value === null && sort === 'takenAt') {
            // Null timestamps form the last partition in either direction.
        } else {
            if (typeof cursor.value !== 'string') throw invalid('Invalid cursor');
            const date = new Date(cursor.value);
            if (!Number.isFinite(date.getTime()) || date.toISOString() !== cursor.value)
                throw invalid('Invalid cursor');
            cursor.value = date;
        }
        return cursor;
    } catch {
        throw invalid('Invalid cursor');
    }
}
