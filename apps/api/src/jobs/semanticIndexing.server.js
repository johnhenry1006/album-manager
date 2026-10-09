import { pathToFileURL } from 'node:url';

import { loadEnvironment } from '#config/loadConfig.js';
import { loadSemanticProviders } from '#infrastructure/ai/semanticProviders.js';
import { createQueueInfrastructure, QUEUE_NAMES } from '#infrastructure/queue/index.js';
import { createSemanticIndexingModule } from '#modules/semantic-search/index.js';

import { startMediaWorker } from './mediaWorker.server.js';
import { createSemanticIndexingScheduler, createSemanticIndexingWorker } from './semanticIndexing.worker.js';

export async function startSemanticIndexingWorker({ providers, ...options } = {}) {
    providers ??= await loadSemanticProviders(loadEnvironment());
    if (!providers) throw new Error('Semantic indexing requires SEMANTIC_PROVIDER_MODULE');
    return startMediaWorker({
        ...options,
        label: 'Semantic indexing',
        createJob: (dependencies) => createSemanticIndexingModule({ ...dependencies, ...providers }).service,
        createWorker: createSemanticIndexingWorker,
        createScheduler: ({ config, logger }) =>
            createSemanticIndexingScheduler({
                queue: createQueueInfrastructure(config, { queueName: QUEUE_NAMES.SEMANTIC_INDEXING, logger }),
            }),
    });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startSemanticIndexingWorker().catch(() => {
        console.error('Semantic indexing worker startup failed');
        process.exitCode = 1;
    });
}
