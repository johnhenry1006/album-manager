import { createTaxonomyRepository } from './repositories/taxonomy.repository.js';
import { createTaxonomyService } from './services/taxonomy.service.js';

export function createTaxonomyModule({ client }) {
    return Object.freeze({
        service: Object.freeze(
            Object.fromEntries(
                ['categories', 'tags'].map((kind) => [
                    kind,
                    createTaxonomyService({ repository: createTaxonomyRepository(client, kind), kind }),
                ]),
            ),
        ),
    });
}

export { default as taxonomyRoutes } from './routes/taxonomy.routes.js';
