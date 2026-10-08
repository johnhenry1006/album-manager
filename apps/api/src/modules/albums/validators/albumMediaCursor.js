import { invalid } from '../services/album.errors.js';
import { validateAlbumId } from './album.validator.js';

export function validatePosition(value) {
    if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw invalid('Invalid position');
    return value;
}

export function encodeAlbumMediaCursor(row, albumId) {
    return Buffer.from(JSON.stringify({ v: 1, albumId, position: row.position, id: row.id })).toString('base64url');
}

export function decodeAlbumMediaCursor(value, albumId) {
    try {
        if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid('Invalid cursor');
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value) throw invalid('Invalid cursor');
        const data = JSON.parse(bytes.toString('utf8'));
        if (
            !data ||
            Object.keys(data).sort().join(',') !== 'albumId,id,position,v' ||
            data.v !== 1 ||
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
