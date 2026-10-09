import {
    normalizeImageOptimizationSettings,
    validateImageOptimizationOptions,
} from '#shared/validation/imageOptimizationOptions.js';

export const IMAGE_OPTIMIZATION_PUBLIC_FIELDS = Object.freeze([
    'optimizationMode',
    'optimizedMaxWidth',
    'optimizedMaxHeight',
    'previewMaxWidth',
    'previewMaxHeight',
    'thumbnailSizes',
    'outputFormat',
    'balancedQuality',
    'highQuality',
    'maximumCompressionQuality',
    'keepOriginal',
]);

// Read the previous processing contract without rewriting existing rows on GET.
// Conflicting old/new fields are rejected instead of silently choosing a value.
export function validateImageOptimizationOverrides(value) {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
        throw new TypeError('Invalid image settings');
    const overrides = { ...value };
    const aliases = {
        mode: ['optimizationMode'],
        format: ['outputFormat'],
        optimizedMaxSize: ['optimizedMaxWidth', 'optimizedMaxHeight'],
        previewMaxSize: ['previewMaxWidth', 'previewMaxHeight'],
    };
    for (const [old, fields] of Object.entries(aliases)) {
        if (!Object.hasOwn(overrides, old)) continue;
        if (fields.some((field) => Object.hasOwn(overrides, field))) throw new TypeError('Conflicting image settings');
        for (const field of fields) overrides[field] = overrides[old];
        delete overrides[old];
    }
    return validateImageOptimizationOptions(overrides);
}
export function resolveImageOptimizationSettings(value) {
    return normalizeImageOptimizationSettings(validateImageOptimizationOverrides(value));
}
export function validateImageOptimizationPatch(value) {
    const patch = validateImageOptimizationOptions(value);
    if (
        Object.keys(patch).length === 0 ||
        Object.keys(patch).some((field) => !IMAGE_OPTIMIZATION_PUBLIC_FIELDS.includes(field))
    )
        throw new TypeError('Invalid image settings patch');
    return patch;
}
