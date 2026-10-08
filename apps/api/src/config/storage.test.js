import { describe, expect, it } from 'vitest';

import { validateStorageEnvironment } from './storage.js';

const environment = {
    S3_ENDPOINT: 'http://localhost:9445',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'album-manager',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'private-secret',
    S3_FORCE_PATH_STYLE: 'true',
};

describe('storage configuration', () => {
    it('defaults the driver and public endpoint without exposing environment extras', () => {
        expect(validateStorageEnvironment(environment)).toMatchObject({
            driver: 's3',
            endpoint: 'http://localhost:9445',
            publicEndpoint: 'http://localhost:9445',
            forcePathStyle: true,
        });
        expect(Object.isFrozen(validateStorageEnvironment(environment))).toBe(true);
    });
    it('keeps internal and browser endpoints separate and parses false strictly', () => {
        expect(
            validateStorageEnvironment({
                ...environment,
                S3_PUBLIC_ENDPOINT: 'https://media.example.com',
                S3_FORCE_PATH_STYLE: 'false',
            }),
        ).toMatchObject({ publicEndpoint: 'https://media.example.com', forcePathStyle: false });
    });
    it.each([
        { STORAGE_DRIVER: 'ninja' },
        { S3_ENDPOINT: 'ftp://host' },
        { S3_ENDPOINT: 'http://user:password@host' },
        { S3_PUBLIC_ENDPOINT: 'http://host/path' },
        { S3_BUCKET: '' },
        { S3_SECRET_KEY: '' },
        { S3_FORCE_PATH_STYLE: 'yes' },
    ])('rejects malformed configuration with safe messages', (invalid) => {
        expect(() => validateStorageEnvironment({ ...environment, ...invalid })).toThrow(
            /Invalid storage configuration:/,
        );
        expect(() => validateStorageEnvironment({ ...environment, ...invalid })).not.toThrow(/private-secret|password/);
    });
});
