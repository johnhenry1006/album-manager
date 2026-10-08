import { MEDIA_FORMATS } from '#shared/constants/mediaFormats.js';

import { invalidUpload } from '../services/upload.errors.js';

export function validateUploadId(id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
        throw invalidUpload('Invalid upload identifier');
    return id;
}
export function validateUploadFile(input, config) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !['filename', 'mimeType', 'fileSize'].includes(key))
    )
        throw invalidUpload();
    const filename = typeof input.filename === 'string' ? input.filename.normalize('NFKC') : '';
    if (
        !filename ||
        Buffer.byteLength(filename) > 255 ||
        !/^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u.test(filename) ||
        /[. ]$/.test(filename) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)
    )
        throw invalidUpload('Unsafe filename');
    const mimeType = typeof input.mimeType === 'string' ? input.mimeType.toLowerCase() : '';
    if (!config.supportedMimeTypes.includes(mimeType) || !Object.hasOwn(MEDIA_FORMATS, mimeType))
        throw invalidUpload('Unsupported MIME type');
    const value = input.fileSize;
    if (
        (typeof value === 'number' && !Number.isSafeInteger(value)) ||
        (typeof value === 'string' && !/^\d+$/.test(value)) ||
        !['number', 'string', 'bigint'].includes(typeof value)
    )
        throw invalidUpload('Invalid file size');
    const fileSize = BigInt(value);
    if (fileSize < 1n || fileSize > BigInt(config.maxFileSize)) throw invalidUpload('Invalid file size');
    return { filename, mimeType, fileSize, ...MEDIA_FORMATS[mimeType] };
}
export function validateUploadPage({ limit = 25, cursor } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalidUpload('Invalid page size');
    if (cursor !== undefined) validateUploadId(cursor);
    return { limit, cursor };
}

export function validateDuplicateResolution(input) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => key !== 'action') ||
        !['SKIP', 'USE_EXISTING', 'KEEP_BOTH'].includes(input.action)
    )
        throw invalidUpload('Invalid duplicate resolution action');
    return input.action;
}
