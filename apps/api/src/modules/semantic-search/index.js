import { createSemanticRepository } from './repositories/semantic.repository.js';
import { createSemanticIndexingService } from './services/semanticIndexing.service.js';
import { createSemanticSearchService } from './services/semanticSearch.service.js';

export function createSemanticSearchModule({ client, embeddingProvider, vectorIndex }) {
    const repository = createSemanticRepository(client);
    return { service: createSemanticSearchService({ repository, embeddingProvider, vectorIndex }) };
}
export function createSemanticIndexingModule({ client, storage, embeddingProvider, tagProvider }) {
    return {
        service: createSemanticIndexingService({
            repository: createSemanticRepository(client),
            storage,
            embeddingProvider,
            tagProvider,
        }),
    };
}
export { default as semanticRoutes } from './routes/semantic.routes.js';
