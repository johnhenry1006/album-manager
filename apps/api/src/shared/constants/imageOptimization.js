export const IMAGE_OPTIMIZATION_MODES = Object.freeze(['LOSSLESS', 'BALANCED', 'HIGH_QUALITY', 'MAX_COMPRESSION']);
export const DEFAULT_IMAGE_OPTIMIZATION_SETTINGS = Object.freeze({
    mode: 'BALANCED',
    format: 'webp',
    optimizedMaxSize: 2560,
    previewMaxSize: 1600,
    thumbnailSizes: Object.freeze([800, 400, 200]),
    placeholderEnabled: false,
    placeholderMaxSize: 32,
});
