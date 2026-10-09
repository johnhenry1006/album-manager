import { afterEach, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app/app.js';

let app;
afterEach(async () => app?.close());
function setup({ row = {}, metadata, fail = false } = {}) {
    const query = vi.fn(async () => {
        if (fail) throw new Error('secret-key https://private/?signature=sensitive');
        return [
            {
                objectCount: '7',
                originalBytes: '9007199254740993',
                optimizedBytes: '400',
                variantBytes: '550',
                estimatedSavedBytes: '9007199254740593',
                ...row,
            },
        ];
    });
    const storage = {
        getProviderMetadata: async () =>
            metadata ?? {
                providerType: 's3',
                endpointHost: 'assets.example:9445',
                bucketName: 'photos',
                secretAccessKey: 'secret-key',
                accessKeyId: 'access-key',
                url: 'https://private/?signature=sensitive',
            },
        close: async () => {},
    };
    app = buildApp({
        logger: false,
        database: { client: { $queryRaw: query }, connect: async () => {}, disconnect: async () => {} },
        storage,
    });
    return query;
}
it('returns precise database totals and only safe provider metadata', async () => {
    const query = setup();
    const response = await app.inject('/api/settings/storage');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
        providerType: 's3',
        endpointHost: 'assets.example:9445',
        bucketName: 'photos',
        objectCount: 7,
        originalBytes: '9007199254740993',
        optimizedBytes: '400',
        variantBytes: '550',
        totalBytes: '9007199254741543',
        estimatedSavedBytes: '9007199254740593',
    });
    expect(query).toHaveBeenCalledTimes(1);
});
it('returns zero statistics for an empty library', async () => {
    setup({
        row: { objectCount: '0', originalBytes: '0', optimizedBytes: '0', variantBytes: '0', estimatedSavedBytes: '0' },
    });
    expect((await app.inject('/api/settings/storage')).json()).toMatchObject({
        objectCount: 0,
        originalBytes: '0',
        optimizedBytes: '0',
        variantBytes: '0',
        totalBytes: '0',
        estimatedSavedBytes: '0',
    });
});
it.each([
    { providerType: 's3', endpointHost: 'user:secret@host', bucketName: 'https://private/?signature=secret' },
    { providerType: 'secret\nkey', endpointHost: 'host/path?signature=secret', bucketName: 'bucket\nsecret' },
    { providerType: 's3', endpointHost: 'https://host?signature=secret', bucketName: '..' },
])('omits unsafe metadata values: %j', async (metadata) => {
    setup({ metadata });
    const result = (await app.inject('/api/settings/storage')).json();
    expect(result.endpointHost).toBeNull();
    expect(result.bucketName).toBeNull();
    expect(JSON.stringify(result)).not.toContain('secret');
});
it('returns statistics without requiring a storage provider', async () => {
    app = buildApp({
        logger: false,
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
    expect((await app.inject('/api/settings/storage')).json()).toMatchObject({
        providerType: null,
        endpointHost: null,
        bucketName: null,
        totalBytes: '0',
    });
});
it('rejects unexpected query input', async () => {
    const query = setup();
    expect((await app.inject('/api/settings/storage?bucket=private')).statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
});
it('sanitizes database errors', async () => {
    setup({ fail: true });
    const response = await app.inject('/api/settings/storage');
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: 'INTERNAL_ERROR' });
    expect(response.body).not.toContain('secret');
    expect(response.body).not.toContain('signature');
});
