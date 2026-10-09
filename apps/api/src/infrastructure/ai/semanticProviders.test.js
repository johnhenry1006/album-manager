import { expect, it } from 'vitest';

import { loadSemanticProviders } from './semanticProviders.js';

it('keeps AI disabled without importing an adapter', async () => {
    expect(
        await loadSemanticProviders(
            {},
            {
                importModule: () => {
                    throw new Error('must not import');
                },
            },
        ),
    ).toBeUndefined();
});
it('loads a configured server-only factory and passes backend environment', async () => {
    const provider = { profile: { space: 'v1' } };
    const environment = { SEMANTIC_PROVIDER_MODULE: 'adapters/semantic.js', PROVIDER_KEY: 'private' };
    const result = await loadSemanticProviders(environment, {
        importModule: async (url) => {
            expect(url).toMatch(/\/album-manager\/adapters\/semantic\.js$/);
            return {
                createSemanticProviders: async ({ environment: config }) => ({
                    embeddingProvider: { ...provider, configured: config.PROVIDER_KEY === 'private' },
                }),
            };
        },
    });
    expect(result.embeddingProvider.configured).toBe(true);
});
it('sanitizes initialization errors and rejects remote module URLs', async () => {
    await expect(
        loadSemanticProviders(
            { SEMANTIC_PROVIDER_MODULE: 'fixture.js' },
            {
                importModule: async () => {
                    throw new Error('private-token');
                },
            },
        ),
    ).rejects.toThrow('Semantic provider initialization failed');
    await expect(
        loadSemanticProviders({ SEMANTIC_PROVIDER_MODULE: 'https://unsafe.example/adapter.js' }),
    ).rejects.toThrow('Invalid semantic provider module');
});
