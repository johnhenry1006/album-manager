import {
    normalizeImageOptimizationSettings,
    validateImageOptimizationOptions,
} from '#shared/validation/imageOptimizationOptions.js';

export function validateImageOptimizationOverrides(value) {
    return validateImageOptimizationOptions(value);
}
export function resolveImageOptimizationSettings(value) {
    return normalizeImageOptimizationSettings(value);
}
