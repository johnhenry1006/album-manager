import { DEFAULT_URL_EXPIRY_SECONDS, MAX_URL_EXPIRY_SECONDS } from './storage.constants.js';

export function validateKey(key) {
    if (
        typeof key !== 'string' ||
        !key ||
        key.startsWith('/') ||
        key.includes('\\') ||
        key.includes('%') ||
        key.includes(':') ||
        [...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        key.split('/').some((part) => !part || part === '.' || part === '..') ||
        Buffer.byteLength(key) > 1024
    ) {
        throw new TypeError('Invalid storage key');
    }
    return key;
}
export function validateContentType(contentType) {
    if (typeof contentType !== 'string' || !contentType.includes('/') || /[\r\n\0]/.test(contentType)) {
        throw new TypeError('Invalid storage content type');
    }
    return contentType;
}
export function validateExpiry(expiresIn = DEFAULT_URL_EXPIRY_SECONDS) {
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_URL_EXPIRY_SECONDS) {
        throw new TypeError('Invalid storage URL expiry');
    }
    return expiresIn;
}

export function validateMediaStorageKey(key, mediaId) {
    validateKey(key);
    const parts = key.split('/');
    if (
        parts.length !== 7 ||
        parts[0] !== 'media' ||
        !/^\d{4}$/.test(parts[1]) ||
        !/^(0[1-9]|1[0-2])$/.test(parts[2]) ||
        !/^(0[1-9]|[12]\d|3[01])$/.test(parts[3]) ||
        typeof mediaId !== 'string' ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(mediaId) ||
        parts[4] !== mediaId.toLowerCase() ||
        !['original', 'optimized', 'preview', 'thumbnails'].includes(parts[5]) ||
        !/^[a-z0-9_-][a-z0-9._-]{0,179}$/i.test(parts[6])
    )
        throw new TypeError('Invalid media storage key');
    return key;
}
