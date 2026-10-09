import { expect, it, vi } from 'vitest';

import { ImageOptimizationSettingsService } from '../index.js';

const defaults = {
    optimizationMode: 'BALANCED',
    outputFormat: 'webp',
    optimizedMaxWidth: 2560,
    optimizedMaxHeight: 2560,
    previewMaxWidth: 1600,
    previewMaxHeight: 1600,
    balancedQuality: 80,
    highQuality: 90,
    maximumCompressionQuality: 60,
    keepOriginal: true,
    thumbnailSizes: [800, 400, 200],
    placeholderEnabled: false,
    placeholderMaxSize: 32,
};
function setup(value, exists = true) {
    const repository = {
        findByKey: vi.fn(async () => (exists ? { key: 'imageOptimization', value } : null)),
        upsert: vi.fn(async (key, updated) => ({ key, value: updated })),
    };
    repository.withSettingsLock = async (_key, run) => run(repository);
    return { service: new ImageOptimizationSettingsService({ repository }), repository };
}
it('returns the project defaults when no override exists', async () => {
    expect(await setup(undefined, false).service.getSettings()).toEqual(defaults);
});
it('merges validated persisted overrides into a complete options snapshot', async () => {
    expect(
        await setup({
            mode: 'HIGH_QUALITY',
            optimizedMaxSize: 2048,
            thumbnailSizes: [600, 300],
            placeholderEnabled: true,
        }).service.getSettings(),
    ).toEqual({
        ...defaults,
        optimizationMode: 'HIGH_QUALITY',
        optimizedMaxWidth: 2048,
        optimizedMaxHeight: 2048,
        thumbnailSizes: [600, 300],
        placeholderEnabled: true,
    });
});
it.each([
    null,
    [],
    'private-invalid-value',
    { mode: 'VISUALLY_LOSSLESS' },
    { optimizedMaxSize: 0 },
    { format: 'exe' },
    { quality: 500 },
    { thumbnailSizes: [400, 400] },
    { placeholderEnabled: 'true' },
    { previewMaxSize: Infinity },
    { thumbnailSizes: new Array(1) },
])('fails safely on invalid persisted settings %j', async (value) => {
    await expect(setup(value).service.getSettings()).rejects.toMatchObject({
        code: 'INVALID_PERSISTED_IMAGE_SETTINGS',
        statusCode: 500,
        message: 'Persisted image optimization settings are invalid',
    });
});
it('does not turn repository failures into application defaults', async () => {
    const { service, repository } = setup({});
    repository.findByKey.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.getSettings()).rejects.toThrow('Database unavailable');
});
it('validates later API override replacements before persistence', async () => {
    const { service, repository } = setup({});
    expect(await service.replaceOverrides({ mode: 'LOSSLESS' })).toEqual({ ...defaults, optimizationMode: 'LOSSLESS' });
    expect(repository.upsert).toHaveBeenCalledWith('imageOptimization', { optimizationMode: 'LOSSLESS' });
    await expect(service.replaceOverrides({ thumbnailSizes: [-1] })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.upsert).toHaveBeenCalledTimes(1);
});
it('fetches fresh overrides for each job without exposing mutable defaults', async () => {
    const { service, repository } = setup({});
    const first = await service.getSettings();
    expect(() => first.thumbnailSizes.push(999)).toThrow(TypeError);
    repository.findByKey.mockResolvedValue({ key: 'imageOptimization', value: { mode: 'MAX_COMPRESSION' } });
    expect(await service.getSettings()).toEqual({ ...defaults, optimizationMode: 'MAX_COMPRESSION' });
});

it.each([
    { optimizedMaxWidth: NaN },
    { optimizedMaxHeight: Infinity },
    { previewMaxWidth: 0 },
    { previewMaxHeight: 16384 },
    { balancedQuality: '80' },
    { highQuality: -1 },
    { maximumCompressionQuality: 101 },
    { keepOriginal: false },
])('enforces new settings invariants at the service boundary: %j', async (input) => {
    const { service, repository } = setup({});
    await expect(service.patchSettings(input)).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.upsert).not.toHaveBeenCalled();
});
it('validates canonical persisted settings and returns immutable snapshots', async () => {
    const { service, repository } = setup({ optimizedMaxWidth: 1100, balancedQuality: 70 });
    const first = await service.getSettings();
    expect(first).toMatchObject({
        optimizedMaxWidth: 1100,
        optimizedMaxHeight: 2560,
        balancedQuality: 70,
        keepOriginal: true,
    });
    expect(() => first.thumbnailSizes.push(99)).toThrow(TypeError);
    repository.findByKey.mockResolvedValue({ value: { optimizedMaxWidth: 900, highQuality: 95 } });
    expect(await service.getSettings()).toMatchObject({ optimizedMaxWidth: 900, highQuality: 95 });
});
