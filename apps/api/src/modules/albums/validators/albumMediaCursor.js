import { invalid } from '../services/album.errors.js';
import { validateAlbumId } from './album.validator.js';

export function validatePosition(value) {
    if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw invalid('Invalid position');
    return value;
}

const filterKey = (query = {}) => JSON.stringify([query.q ?? null, query.type ?? null, query.favorite ?? null]);
const emptyFilters = filterKey();

export function encodeAlbumMediaCursor(row, albumId, query) {
    const key = filterKey(query);
    const data = { v: key === emptyFilters ? 1 : 2, albumId, position: row.position, id: row.id };
    if (data.v === 2) data.filterKey = key;
    return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeAlbumMediaCursor(value, albumId, query) {
    try {
        if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid('Invalid cursor');
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value) throw invalid('Invalid cursor');
        const data = JSON.parse(bytes.toString('utf8'));
        if (
            !data ||
            ![1, 2].includes(data.v) ||
            Object.keys(data).sort().join(',') !==
                (data.v === 1 ? 'albumId,id,position,v' : 'albumId,filterKey,id,position,v') ||
            (data.v === 1 ? filterKey(query) !== emptyFilters : data.filterKey !== filterKey(query)) ||
            data.albumId !== albumId
        )
            throw invalid('Invalid cursor');
        data.id = validateAlbumId(data.id);
        validatePosition(data.position);
        return data;
    } catch {
        throw invalid('Invalid cursor');
    }
}
