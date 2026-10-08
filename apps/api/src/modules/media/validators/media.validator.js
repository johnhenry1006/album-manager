import { validateKey } from '#infrastructure/storage/storageValidation.js';

import { invalid } from '../services/media.errors.js';

const MEDIA_TYPES = ['IMAGE', 'VIDEO'];
const MEDIA_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'];
const VARIANT_TYPES = ['ORIGINAL', 'OPTIMIZED', 'PREVIEW', 'THUMBNAIL', 'BLUR_PLACEHOLDER'];
const METADATA_FIELDS = ['width', 'height', 'aspectRatio', 'checksum', 'takenAt'];
const MEDIA_FIELDS = ['type', 'originalFilename', 'mimeType', 'extension', 'fileSize', 'status', ...METADATA_FIELDS];
const VARIANT_FIELDS = ['mediaId', 'type', 'format', 'fileSize', 'storageKey', 'width', 'height', 'quality'];

export function validateId(id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
        throw invalid('Expected a UUID');
    }
    return id;
}

function object(input, fields) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Expected metadata object');
    if (Object.keys(input).some((key) => !fields.includes(key))) throw invalid('Unknown metadata field');
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function text(value, field) {
    if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) throw invalid(`Invalid ${field}`);
    return value;
}

function member(value, values, field) {
    if (!values.includes(value)) throw invalid(`Invalid ${field}`);
    return value;
}

function size(value) {
    if (
        (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) ||
        (typeof value === 'string' && !/^\d+$/.test(value)) ||
        !['bigint', 'number', 'string'].includes(typeof value)
    )
        throw invalid('Invalid fileSize');
    const result = BigInt(value);
    if (result < 0n || result > 9223372036854775807n) throw invalid('Invalid fileSize');
    return result;
}

function dimensions(data, withRatio) {
    const hasWidth = Object.hasOwn(data, 'width');
    const hasHeight = Object.hasOwn(data, 'height');
    if (hasWidth !== hasHeight) throw invalid('Supply width and height together');
    if (hasWidth) {
        if ((data.width === null) !== (data.height === null)) throw invalid('Clear both dimensions together');
        for (const field of ['width', 'height']) {
            if (
                data[field] !== null &&
                (!Number.isInteger(data[field]) || data[field] < 1 || data[field] > 2147483647)
            ) {
                throw invalid(`Invalid ${field}`);
            }
        }
        if (withRatio) {
            const ratio = data.width === null ? null : data.width / data.height;
            if (Object.hasOwn(data, 'aspectRatio') && data.aspectRatio !== ratio)
                throw invalid('Inconsistent aspectRatio');
            data.aspectRatio = ratio;
        }
    } else if (Object.hasOwn(data, 'aspectRatio')) {
        throw invalid('Supply dimensions when updating aspectRatio');
    }
}

export function validateChecksum(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw invalid('Invalid SHA-256 checksum');
    return value.toLowerCase();
}

export function validateStatus(value) {
    return member(value, MEDIA_STATUSES, 'status');
}

export function validateMedia(input, { create = false, metadataOnly = false } = {}) {
    const data = object(input, metadataOnly ? METADATA_FIELDS : MEDIA_FIELDS);
    if (create) {
        for (const field of ['type', 'originalFilename', 'mimeType', 'extension', 'fileSize']) {
            if (!Object.hasOwn(data, field)) throw invalid(`Missing ${field}`);
        }
        if (!Object.hasOwn(data, 'status')) data.status = 'PENDING';
    } else if (!Object.keys(data).length) throw invalid('Empty update');
    if (Object.hasOwn(data, 'type')) member(data.type, MEDIA_TYPES, 'type');
    if (Object.hasOwn(data, 'status')) validateStatus(data.status);
    if (Object.hasOwn(data, 'originalFilename')) text(data.originalFilename, 'originalFilename');
    if (Object.hasOwn(data, 'mimeType')) {
        text(data.mimeType, 'mimeType');
        if (!/^[\w.+-]+\/[\w.+-]+$/.test(data.mimeType)) throw invalid('Invalid mimeType');
    }
    if (Object.hasOwn(data, 'extension')) data.extension = text(data.extension, 'extension').toLowerCase();
    if (Object.hasOwn(data, 'fileSize')) data.fileSize = size(data.fileSize);
    if (data.checksum !== undefined && data.checksum !== null) data.checksum = validateChecksum(data.checksum);
    if (Object.hasOwn(data, 'takenAt') && data.takenAt !== null) {
        if (!(data.takenAt instanceof Date) || !Number.isFinite(data.takenAt.getTime()))
            throw invalid('Invalid takenAt');
    }
    dimensions(data, true);
    return data;
}

export function validateVariantIdentity(input) {
    const data = object(input, ['mediaId', 'type', 'format']);
    validateId(data.mediaId);
    member(data.type, VARIANT_TYPES, 'variant type');
    data.format = text(data.format, 'format').toLowerCase();
    if (!/^[a-z0-9]+$/.test(data.format)) throw invalid('Invalid format');
    return data;
}

export function validateVariant(input, { create = false } = {}) {
    const data = object(input, create ? VARIANT_FIELDS : ['fileSize', 'storageKey', 'width', 'height', 'quality']);
    if (create) {
        Object.assign(data, validateVariantIdentity({ mediaId: data.mediaId, type: data.type, format: data.format }));
        if (!Object.hasOwn(data, 'fileSize') || !Object.hasOwn(data, 'storageKey'))
            throw invalid('Missing variant asset metadata');
    } else if (!Object.keys(data).length) throw invalid('Empty update');
    if (Object.hasOwn(data, 'fileSize')) data.fileSize = size(data.fileSize);
    if (Object.hasOwn(data, 'storageKey')) {
        try {
            validateKey(data.storageKey);
        } catch {
            throw invalid('Invalid storageKey');
        }
    }
    if (
        data.quality !== undefined &&
        data.quality !== null &&
        (!Number.isInteger(data.quality) || data.quality < 1 || data.quality > 100)
    ) {
        throw invalid('Invalid quality');
    }
    dimensions(data, false);
    return data;
}
