import { createMediaModule } from '#modules/media/index.js';

import { createUploadRepository } from './repositories/upload.repository.js';
import { createUploadService } from './services/upload.service.js';

export function createUploadModule({ client, storage, queue, config }) {
    const repository = createUploadRepository(client);
    const context = (transaction) => ({
        repository: createUploadRepository(transaction),
        ...createMediaModule(transaction, { storage }),
    });
    const service = createUploadService({
        repository,
        storage,
        queue,
        config,
        withSessionLock: (id, run) => repository.withSessionLock(id, (transaction) => run(context(transaction))),
        withFileLock: (id, run) => repository.withFileLock(id, (transaction) => run(context(transaction))),
    });
    return Object.freeze({ service });
}
export { default as uploadRoutes } from './routes/upload.routes.js';
export { createUploadService };
