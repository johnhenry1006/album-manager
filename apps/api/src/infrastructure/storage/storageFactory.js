import { S3StorageProvider } from './s3/s3StorageProvider.js';

export function createStorageProvider(config) {
    if (config.driver !== 's3') throw new TypeError('Unsupported storage driver');
    return new S3StorageProvider(config);
}
