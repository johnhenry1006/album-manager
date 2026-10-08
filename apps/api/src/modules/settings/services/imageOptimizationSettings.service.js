import {
    resolveImageOptimizationSettings,
    validateImageOptimizationOverrides,
} from '../validators/imageOptimizationSettings.validator.js';

export const IMAGE_OPTIMIZATION_SETTINGS_KEY = 'imageOptimization';

export class ImageOptimizationSettingsError extends Error {
    constructor(persisted) {
        super(persisted ? 'Persisted image optimization settings are invalid' : 'Invalid image optimization settings');
        this.name = 'ImageOptimizationSettingsError';
        this.code = persisted ? 'INVALID_PERSISTED_IMAGE_SETTINGS' : 'INVALID_IMAGE_SETTINGS';
        this.statusCode = persisted ? 500 : 400;
    }
}
export class ImageOptimizationSettingsService {
    #repository;
    constructor({ repository }) {
        this.#repository = repository;
    }
    async getSettings() {
        // No environment access or caching: each job gets current persisted overrides.
        const row = await this.#repository.findByKey(IMAGE_OPTIMIZATION_SETTINGS_KEY);
        try {
            return resolveImageOptimizationSettings(row === null ? {} : row.value);
        } catch {
            throw new ImageOptimizationSettingsError(true);
        }
    }
    async replaceOverrides(input) {
        let overrides;
        try {
            overrides = validateImageOptimizationOverrides(input);
        } catch {
            throw new ImageOptimizationSettingsError(false);
        }
        await this.#repository.upsert(IMAGE_OPTIMIZATION_SETTINGS_KEY, overrides);
        return resolveImageOptimizationSettings(overrides);
    }
}
