import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Explicit, server-controlled code configuration; never accept a module path from HTTP.
// The factory owns its vendor SDK and reads credentials only on the server.
export async function loadSemanticProviders(environment, { importModule = (url) => import(url) } = {}) {
    const configured = environment.SEMANTIC_PROVIDER_MODULE;
    if (configured === undefined || configured === '') return undefined;
    if (
        typeof configured !== 'string' ||
        !configured.trim() ||
        configured.includes('://') ||
        configured.includes('\0') ||
        !/\.(?:mjs|js)$/.test(configured)
    )
        throw new TypeError('Invalid semantic provider module');
    const root = fileURLToPath(new URL('../../../../../', import.meta.url));
    try {
        const adapter = await importModule(pathToFileURL(resolve(root, configured)).href);
        if (typeof adapter.createSemanticProviders !== 'function') throw new Error('Missing provider factory');
        const providers = await adapter.createSemanticProviders({ environment });
        if (!providers?.embeddingProvider) throw new Error('Missing embedding provider');
        return providers;
    } catch {
        throw new Error('Semantic provider initialization failed');
    }
}
