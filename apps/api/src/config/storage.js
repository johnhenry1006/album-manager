import { loadEnvironment } from './loadConfig.js';

function invalid(name) {
    throw new Error(`Invalid storage configuration: ${name}`);
}
function required(environment, name) {
    const value = environment[name];
    if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) invalid(name);
    return value;
}
function endpoint(value, name) {
    try {
        const url = new URL(value);
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== '/'
        )
            invalid(name);
        return url.origin;
    } catch {
        invalid(name);
    }
}
export function validateStorageEnvironment(environment) {
    const driver = environment.STORAGE_DRIVER ?? 's3';
    if (driver !== 's3') invalid('STORAGE_DRIVER');
    const internalEndpoint = endpoint(required(environment, 'S3_ENDPOINT'), 'S3_ENDPOINT');
    const publicEndpoint = endpoint(environment.S3_PUBLIC_ENDPOINT ?? internalEndpoint, 'S3_PUBLIC_ENDPOINT');
    const pathStyle = environment.S3_FORCE_PATH_STYLE ?? 'true';
    if (!['true', 'false'].includes(pathStyle)) invalid('S3_FORCE_PATH_STYLE');
    const bucket = required(environment, 'S3_BUCKET');
    if (
        !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
        bucket.includes('..') ||
        /^\d+\.\d+\.\d+\.\d+$/.test(bucket)
    )
        invalid('S3_BUCKET');
    return Object.freeze({
        driver,
        endpoint: internalEndpoint,
        publicEndpoint,
        region: required(environment, 'S3_REGION'),
        bucket,
        accessKeyId: required(environment, 'S3_ACCESS_KEY'),
        secretAccessKey: required(environment, 'S3_SECRET_KEY'),
        forcePathStyle: pathStyle === 'true',
    });
}
export function loadStorageConfig(options) {
    return validateStorageEnvironment(loadEnvironment(options));
}
