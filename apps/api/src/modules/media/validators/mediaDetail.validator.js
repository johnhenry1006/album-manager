import { MEDIA_FORMATS } from '#shared/constants/mediaFormats.js';

import { invalid } from '../services/media.errors.js';
import { validateId } from './media.validator.js';

export const DISPLAY_VARIANT_TYPES = Object.freeze(['OPTIMIZED', 'PREVIEW', 'THUMBNAIL', 'BLUR_PLACEHOLDER']);
export const DISPLAY_VARIANT_FORMATS = Object.freeze([
    ...new Set(Object.values(MEDIA_FORMATS).flatMap(({ format, extension }) => [format, extension])),
]);

export function validateMediaDetailRequest(id, query = {}) {
    validateId(id);
    if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).length)
        throw invalid('This endpoint does not accept query parameters');
    return id;
}

export function isSafeDisplayVariant(variant) {
    return DISPLAY_VARIANT_TYPES.includes(variant.type) && DISPLAY_VARIANT_FORMATS.includes(variant.format);
}
