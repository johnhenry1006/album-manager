import { expect, it, vi } from 'vitest';

import { createApplicationSettingsRepository } from './applicationSettings.repository.js';

it('reads a setting by its unique key with no unnecessary persistence fields', async () => {
    const row = { key: 'imageOptimization', value: { quality: 80 } };
    const client = { applicationSetting: { findUnique: vi.fn().mockResolvedValue(row) } };
    const repository = createApplicationSettingsRepository(client);
    expect(await repository.findByKey('imageOptimization')).toEqual(row);
    expect(client.applicationSetting.findUnique).toHaveBeenCalledWith({
        where: { key: 'imageOptimization' },
        select: { key: true, value: true },
    });
});
it('distinguishes missing rows from invalid JSON null values', async () => {
    const client = {
        applicationSetting: {
            findUnique: vi
                .fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ key: 'imageOptimization', value: null }),
        },
    };
    const repository = createApplicationSettingsRepository(client);
    expect(await repository.findByKey('imageOptimization')).toBeNull();
    expect(await repository.findByKey('imageOptimization')).toEqual({ key: 'imageOptimization', value: null });
});
it('upserts overrides atomically through the injected client', async () => {
    const value = { quality: 90 };
    const client = { applicationSetting: { upsert: vi.fn().mockResolvedValue({ key: 'imageOptimization', value }) } };
    expect(await createApplicationSettingsRepository(client).upsert('imageOptimization', value)).toEqual({
        key: 'imageOptimization',
        value,
    });
    expect(client.applicationSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'imageOptimization' },
        create: { key: 'imageOptimization', value },
        update: { value },
        select: { key: true, value: true },
    });
});
it('preserves infrastructure errors instead of treating an outage as missing settings', async () => {
    const error = new Error('Repository unavailable');
    const client = { applicationSetting: { findUnique: vi.fn().mockRejectedValue(error) } };
    await expect(createApplicationSettingsRepository(client).findByKey('imageOptimization')).rejects.toBe(error);
});
