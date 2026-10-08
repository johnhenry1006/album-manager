import { DEFAULT_IMAGE_OPTIMIZATION_SETTINGS, IMAGE_OPTIMIZATION_MODES } from '../constants/imageOptimization.js';

// Shared pure contract between the settings domain and processing adapters.
export function validateImageOptimizationOptions(input, { complete = false } = {}) {
    const fields = Object.keys(DEFAULT_IMAGE_OPTIMIZATION_SETTINGS);
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
        Object.keys(input).some((field) => !fields.includes(field)) ||
        (complete && fields.some((field) => !Object.hasOwn(input, field)))
    )
        throw new TypeError('Invalid image processing options');
    const result = {};
    for (const [field, value] of Object.entries(input)) {
        if (field === 'mode' && !IMAGE_OPTIMIZATION_MODES.includes(value))
            throw new TypeError('Invalid optimization mode');
        if (field === 'format' && value !== 'webp') throw new TypeError('Unsupported image output format');
        if (field === 'placeholderEnabled' && typeof value !== 'boolean')
            throw new TypeError('Invalid placeholder flag');
        if (
            ['optimizedMaxSize', 'previewMaxSize', 'placeholderMaxSize'].includes(field) &&
            (!Number.isInteger(value) || value < 1 || value > (field === 'placeholderMaxSize' ? 64 : 16383))
        )
            throw new TypeError('Invalid image target size');
        if (field === 'thumbnailSizes') {
            if (
                !Array.isArray(value) ||
                value.length < 1 ||
                value.length > 8 ||
                new Set(value).size !== value.length ||
                Array.from(value).some((size) => !Number.isInteger(size) || size < 1 || size > 16383)
            )
                throw new TypeError('Invalid thumbnail sizes');
            result[field] = Object.freeze([...value]);
        } else result[field] = value;
    }
    return Object.freeze(result);
}
export function normalizeImageOptimizationSettings(overrides) {
    const validated = validateImageOptimizationOptions(overrides);
    return validateImageOptimizationOptions(
        { ...DEFAULT_IMAGE_OPTIMIZATION_SETTINGS, ...validated },
        { complete: true },
    );
}
