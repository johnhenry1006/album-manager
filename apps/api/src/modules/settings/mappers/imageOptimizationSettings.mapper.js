import { IMAGE_OPTIMIZATION_PUBLIC_FIELDS } from '../validators/imageOptimizationSettings.validator.js';

export function mapImageOptimizationSettings(settings) {
    return Object.fromEntries(IMAGE_OPTIMIZATION_PUBLIC_FIELDS.map((field) => [field, settings[field]]));
}
