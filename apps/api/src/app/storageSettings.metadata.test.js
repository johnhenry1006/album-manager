import { afterEach, expect, it } from 'vitest';

import { createStorageProvider } from '#infrastructure/storage/index.js';

import { buildApp } from './app.js';

let app;
afterEach(async () => app?.close());
it('reads S3 public metadata without making network requests', async () => {
    const storage = createStorageProvider({
        driver: 's3',
        endpoint: 'http://internal:9000',
        publicEndpoint: 'https://assets.example:9445',
        bucket: 'photos',
        region: 'us-east-1',
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        forcePathStyle: true,
    });
    app = buildApp({
        logger: false,
        storage,
        database: {
            client: {
                $queryRaw: async () => [
                    {
                        objectCount: '0',
                        originalBytes: '0',
                        optimizedBytes: '0',
                        variantBytes: '0',
                        estimatedSavedBytes: '0',
                    },
                ],
            },
            connect: async () => {},
            disconnect: async () => {},
        },
    });
    const response = await app.inject('/api/settings/storage');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
        providerType: 's3',
        endpointHost: 'assets.example:9445',
        bucketName: 'photos',
    });
    expect(response.body).not.toContain('internal');
    expect(response.body).not.toContain('secret');
});
