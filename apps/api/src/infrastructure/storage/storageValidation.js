import { DEFAULT_URL_EXPIRY_SECONDS, MAX_URL_EXPIRY_SECONDS } from './storage.constants.js';

export function validateKey(key) {
    if (
        typeof key !== 'string' ||
        !key ||
        key.startsWith('/') ||
        key.includes('\\') ||
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
