export const IMAGE_OPTIMIZATION_MODES = Object.freeze(['LOSSLESS', 'BALANCED', 'HIGH_QUALITY', 'MAX_COMPRESSION']);
export const DEFAULT_IMAGE_OPTIMIZATION_SETTINGS = Object.freeze({
    optimizationMode: 'BALANCED',
    outputFormat: 'webp',
    optimizedMaxWidth: 2560,
    optimizedMaxHeight: 2560,
    previewMaxWidth: 1600,
    previewMaxHeight: 1600,
    thumbnailSizes: Object.freeze([800, 400, 200]),
    balancedQuality: 80,
    highQuality: 90,
    maximumCompressionQuality: 60,
    keepOriginal: true,
    placeholderEnabled: false,
    placeholderMaxSize: 32,
});
