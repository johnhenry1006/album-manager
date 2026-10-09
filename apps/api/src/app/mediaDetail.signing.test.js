import { expect, it, vi } from 'vitest';

import { createStorageProvider } from '#infrastructure/storage/index.js';

import { buildApp } from './app.js';

it('returns a real temporary S3 GET signature against the public endpoint without the secret', async () => {
    const id = 'a0000000-0000-4000-8000-000000000001';
    const storage = createStorageProvider({
        driver: 's3',
        bucket: 'album-manager',
        region: 'us-east-1',
        endpoint: 'http://internal.example',
        publicEndpoint: 'https://assets.example',
        forcePathStyle: true,
        accessKeyId: 'access-identifier',
        secretAccessKey: 'private-signing-secret',
    });
    const app = buildApp({
        logger: false,
        database: {
            client: {
                media: {
                    findUnique: vi
                        .fn()
                        .mockResolvedValue({ id, variants: [{ storageKey: `media/${id}/original.jpg` }] }),
                },
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
        },
        storage,
        mediaDetailConfig: { displayUrlExpirySeconds: 60, originalUrlExpirySeconds: 120 },
    });
    try {
        const response = await app.inject(`/api/media/${id}/original-url`);
        expect(response.statusCode).toBe(200);
        const signed = new URL(response.json().url);
        expect(signed.searchParams.get('response-content-disposition')).toBe('attachment');
        expect(signed.origin).toBe('https://assets.example');
        expect(signed.searchParams.get('X-Amz-Expires')).toBe('120');
        expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
        const signingDate = signed.searchParams.get('X-Amz-Date');
        const issuedAt = Date.parse(
            signingDate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'),
        );
        expect(Date.parse(response.json().expiresAt)).toBeLessThanOrEqual(issuedAt + 120000);
        expect(response.body).not.toContain('private-signing-secret');
        expect(response.body).not.toContain('internal.example');
    } finally {
        await app.close();
    }
});
