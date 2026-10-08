import { MEDIA_FORMATS } from '#shared/constants/mediaFormats.js';

export function validateUploadEnvironment(environment) {
    function integer(name, fallback, maximum) {
        const value = environment[name];
        if (value === undefined) return fallback;
        if (
            typeof value !== 'string' ||
            !/^\d+$/.test(value) ||
            !Number.isSafeInteger(Number(value)) ||
            Number(value) < 1 ||
            Number(value) > maximum
        ) {
            throw new Error(`Invalid upload configuration: ${name}`);
        }
        return Number(value);
    }
    if (
        environment.UPLOAD_SUPPORTED_MIME_TYPES !== undefined &&
        typeof environment.UPLOAD_SUPPORTED_MIME_TYPES !== 'string'
    )
        throw new Error('Invalid upload configuration: UPLOAD_SUPPORTED_MIME_TYPES');
    const supportedMimeTypes =
        environment.UPLOAD_SUPPORTED_MIME_TYPES === undefined
            ? Object.keys(MEDIA_FORMATS)
            : environment.UPLOAD_SUPPORTED_MIME_TYPES.split(',').map((value) => value.trim().toLowerCase());
    if (!supportedMimeTypes.length || supportedMimeTypes.some((value) => !Object.hasOwn(MEDIA_FORMATS, value))) {
        throw new Error('Invalid upload configuration: UPLOAD_SUPPORTED_MIME_TYPES');
    }
    return Object.freeze({
        maxFileSize: integer('UPLOAD_MAX_FILE_SIZE_BYTES', 100 * 1024 ** 2, 5 * 1024 ** 3),
        maxFilesPerSession: integer('UPLOAD_MAX_FILES_PER_SESSION', 1000, 100000),
        urlExpirySeconds: integer('UPLOAD_URL_EXPIRY_SECONDS', 900, 3600),
        supportedMimeTypes: Object.freeze([...new Set(supportedMimeTypes)]),
    });
}
