import { EventEmitter } from 'node:events';

import { beforeEach, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
    calls: [],
    environment: {},
    client: {},
    createDatabase: vi.fn(),
    createStorageProvider: vi.fn(),
    createQueueInfrastructure: vi.fn(),
    createMediaCleanupJob: vi.fn(),
    createMediaCleanupWorker: vi.fn(),
    getQueue: vi.fn(),
    upsertJobScheduler: vi.fn(),
    queueClose: vi.fn(),
    storageClose: vi.fn(),
    disconnect: vi.fn(),
    workerClose: vi.fn(),
}));
vi.mock('#config/loadConfig.js', () => ({
    loadEnvironment: () => dependencies.environment,
    loadConfig: () => ({ shutdownTimeoutMs: 1000 }),
}));
vi.mock('#config/database.js', () => ({ validateDatabaseEnvironment: () => ({}) }));
vi.mock('#config/storage.js', () => ({ validateStorageEnvironment: () => ({}) }));
vi.mock('#infrastructure/database/index.js', () => ({ createDatabase: dependencies.createDatabase }));
vi.mock('#infrastructure/storage/index.js', () => ({ createStorageProvider: dependencies.createStorageProvider }));
vi.mock('#infrastructure/queue/index.js', () => ({
    createQueueInfrastructure: dependencies.createQueueInfrastructure,
    QUEUE_NAMES: { MEDIA_CLEANUP: 'media-cleanup' },
}));
vi.mock('./mediaCleanup.job.js', () => ({ createMediaCleanupJob: dependencies.createMediaCleanupJob }));
vi.mock('./mediaCleanup.worker.js', () => ({ createMediaCleanupWorker: dependencies.createMediaCleanupWorker }));

import { startMediaCleanupWorker } from './mediaCleanup.server.js';

beforeEach(() => {
    dependencies.calls.length = 0;
    dependencies.environment = { TRASH_RETENTION_DAYS: '7' };
    dependencies.createDatabase.mockReturnValue({
        client: dependencies.client,
        connect: async () => dependencies.calls.push('database-ready'),
        disconnect: dependencies.disconnect,
    });
    dependencies.createStorageProvider.mockReturnValue({ close: dependencies.storageClose });
    dependencies.createMediaCleanupJob.mockReturnValue({ process: vi.fn() });
    dependencies.createMediaCleanupWorker.mockReturnValue({
        ready: async () => dependencies.calls.push('worker-ready'),
        close: dependencies.workerClose,
    });
    dependencies.createQueueInfrastructure.mockReturnValue({
        getQueue: dependencies.getQueue,
        close: dependencies.queueClose,
    });
    dependencies.getQueue.mockResolvedValue({ upsertJobScheduler: dependencies.upsertJobScheduler });
    dependencies.upsertJobScheduler.mockImplementation(async () => dependencies.calls.push('schedule-ready'));
});
it('has no import-time database, queue or worker activity', () => {
    expect(dependencies.createDatabase).not.toHaveBeenCalled();
    expect(dependencies.createQueueInfrastructure).not.toHaveBeenCalled();
    expect(dependencies.createMediaCleanupWorker).not.toHaveBeenCalled();
});
it('composes configured retention, registers before consumption and removes signal handlers on close', async () => {
    const runtime = Object.assign(new EventEmitter(), { exitCode: 0 });
    const owner = await startMediaCleanupWorker({ runtime });
    expect(dependencies.createMediaCleanupJob).toHaveBeenCalledWith(
        expect.objectContaining({ config: { retentionDays: 7 }, client: dependencies.client }),
    );
    expect(dependencies.createQueueInfrastructure).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ queueName: 'media-cleanup' }),
    );
    expect(dependencies.calls).toEqual(['database-ready', 'schedule-ready', 'worker-ready']);
    expect(runtime.listenerCount('SIGTERM')).toBe(1);
    await Promise.all([owner.close(), owner.close()]);
    expect(runtime.listenerCount('SIGTERM')).toBe(0);
    for (const close of [
        dependencies.workerClose,
        dependencies.queueClose,
        dependencies.storageClose,
        dependencies.disconnect,
    ])
        expect(close).toHaveBeenCalledOnce();
});
it('rejects invalid policy before constructing any destructive dependencies', async () => {
    dependencies.environment = { TRASH_RETENTION_DAYS: '0' };
    await expect(startMediaCleanupWorker()).rejects.toThrow('TRASH_RETENTION_DAYS');
    expect(dependencies.createDatabase).not.toHaveBeenCalled();
    expect(dependencies.createMediaCleanupWorker).not.toHaveBeenCalled();
});
