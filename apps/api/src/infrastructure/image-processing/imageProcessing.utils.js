import { DEFAULT_IMAGE_OPTIMIZATION_SETTINGS } from '#shared/constants/imageOptimization.js';
import { validateImageOptimizationOptions } from '#shared/validation/imageOptimizationOptions.js';

export function calculateDimensions({ width, height, orientation = 1 }, maxSize) {
    if (
        !Number.isSafeInteger(width) ||
        width < 1 ||
        !Number.isSafeInteger(height) ||
        height < 1 ||
        !Number.isInteger(orientation) ||
        orientation < 1 ||
        orientation > 8 ||
        !Number.isSafeInteger(maxSize) ||
        maxSize < 1
    )
        throw new TypeError('Invalid image dimensions');
    if (orientation >= 5) [width, height] = [height, width];
    const scale = Math.min(1, maxSize / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function selectWebpConfig(mode = 'BALANCED', settings = DEFAULT_IMAGE_OPTIMIZATION_SETTINGS) {
    const profiles = {
        LOSSLESS: { quality: 100, lossless: true, effort: 6, exact: true },
        BALANCED: { quality: settings.balancedQuality, lossless: false, effort: 4, smartSubsample: true },
        HIGH_QUALITY: { quality: settings.highQuality, lossless: false, effort: 5, smartSubsample: true },
        MAX_COMPRESSION: {
            quality: settings.maximumCompressionQuality,
            lossless: false,
            effort: 6,
            smartSubsample: true,
        },
    };
    if (typeof mode !== 'string' || !Object.hasOwn(profiles, mode)) throw new TypeError('Invalid optimization mode');
    return Object.freeze({ ...profiles[mode], nearLossless: false, alphaQuality: 100 });
}
export function buildVariantSpecifications(input) {
    const options = validateImageOptimizationOptions(input, { complete: true });
    return [
        {
            type: 'OPTIMIZED',
            name: 'optimized',
            maxWidth: options.optimizedMaxWidth,
            maxHeight: options.optimizedMaxHeight,
        },
        { type: 'PREVIEW', name: 'preview', maxWidth: options.previewMaxWidth, maxHeight: options.previewMaxHeight },
        ...options.thumbnailSizes.map((size) => ({
            type: 'THUMBNAIL',
            name: `thumbnail-${size}`,
            maxWidth: size,
            maxHeight: size,
        })),
        ...(options.placeholderEnabled
            ? [
                  {
                      type: 'BLUR_PLACEHOLDER',
                      name: 'placeholder',
                      maxWidth: options.placeholderMaxSize,
                      maxHeight: options.placeholderMaxSize,
                  },
              ]
            : []),
    ];
}
