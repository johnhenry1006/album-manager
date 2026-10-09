import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { buildApp } from '../../../app/app.js';
import { createSettingsModule } from '../index.js';

describe.skipIf(process.env.DATABASE_TESTS !== '1')('image settings with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

    it('persists HTTP updates across service instances and rejects invalid writes', async () => {
        await database.withClient(async (client) => {
            const { imageOptimizationSettingsService: service } = createSettingsModule(client);
            const app = buildApp({ logger: false, imageOptimizationSettingsService: service });
            try {
                expect((await app.inject('/api/settings/image-optimization')).json()).toMatchObject({
                    optimizationMode: 'BALANCED',
                    keepOriginal: true,
                });
                const response = await app.inject({
                    method: 'PATCH',
                    url: '/api/settings/image-optimization',
                    payload: { optimizationMode: 'HIGH_QUALITY', optimizedMaxWidth: 1200, highQuality: 94 },
                });
                expect(response.statusCode).toBe(200);
                const fresh = createSettingsModule(client).imageOptimizationSettingsService;
                expect(await fresh.getSettings()).toMatchObject({
                    optimizationMode: 'HIGH_QUALITY',
                    optimizedMaxWidth: 1200,
                    highQuality: 94,
                    keepOriginal: true,
                });
                const before = await client.applicationSetting.findUnique({ where: { key: 'imageOptimization' } });
                expect(
                    (
                        await app.inject({
                            method: 'PATCH',
                            url: '/api/settings/image-optimization',
                            payload: { keepOriginal: false },
                        })
                    ).statusCode,
                ).toBe(400);
                expect(await client.applicationSetting.findUnique({ where: { key: 'imageOptimization' } })).toEqual(
                    before,
                );
            } finally {
                await app.close();
            }
        });
    });

    it('retains concurrent partial updates for both absent and existing rows', async () => {
        await database.withClient(async (client) => {
            for (const exists of [false, true]) {
                await client.applicationSetting.deleteMany();
                if (exists) await client.applicationSetting.create({ data: { key: 'imageOptimization', value: {} } });
                const { imageOptimizationSettingsService: service } = createSettingsModule(client);
                await Promise.all([
                    service.patchSettings({ optimizedMaxWidth: 1300 }),
                    service.patchSettings({ previewMaxHeight: 700 }),
                    service.patchSettings({ balancedQuality: 74 }),
                ]);
                expect(await service.getSettings()).toMatchObject({
                    optimizedMaxWidth: 1300,
                    previewMaxHeight: 700,
                    balancedQuality: 74,
                    keepOriginal: true,
                });
            }
        });
    });
});
