import { afterEach, expect, it } from 'vitest';

import { buildApp } from '../../../app/app.js';
import { ImageOptimizationSettingsService } from '../index.js';

let app;
afterEach(async () => app?.close());
function setup(value = {}) {
    let row = { key: 'imageOptimization', value };
    const repository = {
        findByKey: async () => structuredClone(row),
        upsert: async (key, value) => (row = { key, value }),
        withSettingsLock: async (_key, run) => run(repository),
    };
    const service = new ImageOptimizationSettingsService({ repository });
    app = buildApp({ logger: false, imageOptimizationSettingsService: service });
    return { service, read: () => row.value };
}
it('returns only the complete public optimization settings', async () => {
    setup();
    const response = await app.inject('/api/settings/image-optimization');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
        optimizationMode: 'BALANCED',
        optimizedMaxWidth: 2560,
        optimizedMaxHeight: 2560,
        previewMaxWidth: 1600,
        previewMaxHeight: 1600,
        thumbnailSizes: [800, 400, 200],
        outputFormat: 'webp',
        balancedQuality: 80,
        highQuality: 90,
        maximumCompressionQuality: 60,
        keepOriginal: true,
    });
});
it('persists partial updates and exposes them to the next worker read', async () => {
    const { service, read } = setup({ mode: 'HIGH_QUALITY', optimizedMaxSize: 2048, placeholderEnabled: true });
    const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings/image-optimization',
        payload: { optimizedMaxWidth: 1200, balancedQuality: 72 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
        optimizationMode: 'HIGH_QUALITY',
        optimizedMaxWidth: 1200,
        optimizedMaxHeight: 2048,
        balancedQuality: 72,
        keepOriginal: true,
    });
    expect(read()).toMatchObject({ optimizationMode: 'HIGH_QUALITY', optimizedMaxWidth: 1200 });
    expect(await service.getSettings()).toMatchObject({
        optimizedMaxWidth: 1200,
        optimizedMaxHeight: 2048,
        balancedQuality: 72,
        placeholderEnabled: true,
    });
    const second = await app.inject({
        method: 'PATCH',
        url: '/api/settings/image-optimization',
        payload: { previewMaxHeight: 900 },
    });
    expect(second.json()).toMatchObject({ optimizedMaxWidth: 1200, previewMaxHeight: 900, balancedQuality: 72 });
    expect((await app.inject('/api/settings/image-optimization')).json()).toEqual(second.json());
});
it.each([
    null,
    [],
    'settings',
    {},
    { unknown: 1 },
    { keepOriginal: false },
    { keepOriginal: 'true' },
    { optimizationMode: 'invalid' },
    { outputFormat: 'jpeg' },
    { optimizedMaxWidth: 0 },
    { optimizedMaxHeight: 16384 },
    { previewMaxWidth: 1.2 },
    { previewMaxHeight: '800' },
    { thumbnailSizes: [] },
    { thumbnailSizes: [400, 400] },
    { thumbnailSizes: [0] },
    { thumbnailSizes: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { balancedQuality: 0 },
    { highQuality: 101 },
    { maximumCompressionQuality: 1.5 },
    { placeholderEnabled: true },
    { mode: 'BALANCED' },
])('rejects invalid patches without modifying persistence: %j', async (payload) => {
    const { read } = setup({});
    const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings/image-optimization',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify(payload),
    });
    expect(response.statusCode).toBe(400);
    expect(read()).toEqual({});
});
it('accepts inclusive dimension and quality boundaries', async () => {
    setup();
    const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings/image-optimization',
        payload: {
            optimizedMaxWidth: 1,
            optimizedMaxHeight: 16383,
            previewMaxWidth: 16383,
            previewMaxHeight: 1,
            balancedQuality: 1,
            highQuality: 100,
            maximumCompressionQuality: 100,
            keepOriginal: true,
            thumbnailSizes: [1, 16383],
            optimizationMode: 'LOSSLESS',
            outputFormat: 'webp',
        },
    });
    expect(response.statusCode).toBe(200);
});
it('rejects unexpected query input', async () => {
    setup();
    expect((await app.inject('/api/settings/image-optimization?secret=x')).statusCode).toBe(400);
    expect(
        (
            await app.inject({
                method: 'PATCH',
                url: '/api/settings/image-optimization?secret=x',
                payload: { balancedQuality: 70 },
            })
        ).statusCode,
    ).toBe(400);
});
it('sanitizes corrupt persisted values for both endpoints', async () => {
    setup({ keepOriginal: false, private: 'secret' });
    for (const request of [
        '/api/settings/image-optimization',
        {
            method: 'PATCH',
            url: '/api/settings/image-optimization',
            payload: { balancedQuality: 70 },
        },
    ]) {
        const response = await app.inject(request);
        expect(response.statusCode).toBe(500);
        expect(response.body).not.toContain('secret');
        expect(response.json()).toMatchObject({ error: 'INTERNAL_ERROR', requestId: expect.any(String) });
    }
});
it('registers settings with a database even without storage or queue', async () => {
    app = buildApp({
        logger: false,
        database: {
            client: { applicationSetting: { findUnique: async () => null } },
            connect: async () => {},
            disconnect: async () => {},
        },
    });
    expect((await app.inject('/api/settings/image-optimization')).statusCode).toBe(200);
});
