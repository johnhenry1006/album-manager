import { expect, it, vi } from 'vitest';

import { createMediaCleanupService } from '#modules/media/index.js';

import { createMediaStorageDeletionService } from '../modules/media/services/mediaStorageDeletion.service.js';
import { createMediaTrashService } from '../modules/media/services/mediaTrash.service.js';

const now = new Date('2026-10-09T00:00:00Z');
const cutoff = new Date('2026-09-09T00:00:00Z');
const id = 'c0000000-0000-4000-8000-000000000001';
function setup() {
    let record = { id, deletedAt: cutoff, purgeStartedAt: null };
    const keys = ['original.jpg', 'preview.webp', 'thumb.webp'].map(
        (name) => `media/2026/10/08/${id}/original/${name}`,
    );
    const objects = new Set(keys);
    const storage = { delete: vi.fn(async ({ key }) => objects.delete(key)) };
    const repository = {
        durableTransactions: true,
        transaction: async (run) => run(repository),
        lockMedia: async () => record,
        update: async (_id, patch) => Object.assign(record, patch),
        variantKeys: async () => keys.map((storageKey) => ({ storageKey })),
        finalize: vi.fn(async () => {
            expect(objects.size).toBe(0);
            record = null;
        }),
        expired: vi.fn(async ({ after }) => (!after && record ? [{ id, deletedAt: cutoff }] : [])),
    };
    const trashService = createMediaTrashService({
        repository,
        storageDeletion: createMediaStorageDeletionService({ storage }),
        now: () => now,
    });
    const logger = { error: vi.fn() };
    const service = createMediaCleanupService({ repository, trashService, retentionDays: 30, now: () => now, logger });
    return { service, storage, repository, objects, logger, record: () => record };
}
it('cleans every variant before finalizing and repeated jobs are harmless', async () => {
    const ctx = setup();
    expect(await ctx.service.process({})).toEqual({ deleted: 1, skipped: 0 });
    expect(ctx.record()).toBeNull();
    expect(ctx.objects.size).toBe(0);
    expect(await ctx.service.process({})).toEqual({ deleted: 0, skipped: 0 });
    expect(ctx.repository.finalize).toHaveBeenCalledOnce();
    expect(ctx.repository.expired.mock.calls[0][0]).toMatchObject({ before: cutoff, limit: 50 });
});
it('retains records after partial failure, logs safely, throws for BullMQ retry and resumes', async () => {
    const ctx = setup();
    ctx.storage.delete
        .mockImplementationOnce(async ({ key }) => ctx.objects.delete(key))
        .mockRejectedValueOnce(new Error('private storage credentials'));
    await expect(ctx.service.process({})).rejects.toMatchObject({ code: 'MEDIA_CLEANUP_FAILED' });
    expect(ctx.repository.finalize).not.toHaveBeenCalled();
    expect(ctx.record().purgeStartedAt).toEqual(now);
    expect(ctx.objects.size).toBe(2);
    expect(ctx.logger.error).toHaveBeenCalledWith(expect.objectContaining({ mediaId: id }), expect.any(String));
    expect(JSON.stringify(ctx.logger.error.mock.calls)).not.toContain('private');
    expect(await ctx.service.process({})).toEqual({ deleted: 1, skipped: 0 });
    expect(ctx.objects.size).toBe(0);
});
it('continues to later pages when an earlier item fails', async () => {
    const later = { id: 'c0000000-0000-4000-8000-000000000002', deletedAt: cutoff };
    const repository = {
        expired: vi
            .fn()
            .mockResolvedValueOnce([{ id, deletedAt: cutoff }])
            .mockResolvedValueOnce([later])
            .mockResolvedValueOnce([]),
    };
    const trashService = {
        cleanupMedia: vi.fn().mockRejectedValueOnce(new Error('failure')).mockResolvedValueOnce(true),
    };
    const service = createMediaCleanupService({ repository, trashService, retentionDays: 30, now: () => now });
    await expect(service.process({})).rejects.toThrow();
    expect(trashService.cleanupMedia).toHaveBeenNthCalledWith(2, later.id, cutoff);
    expect(repository.expired.mock.calls[1][0].after).toEqual({ id, deletedAt: cutoff });
    expect(repository.expired.mock.calls[2][0].after).toEqual(later);
});
it('rechecks eligibility and skips a restored candidate', async () => {
    const ctx = setup();
    ctx.repository.expired.mockImplementationOnce(async () => {
        ctx.record().deletedAt = null;
        return [{ id, deletedAt: cutoff }];
    });
    expect(await ctx.service.process({})).toEqual({ deleted: 0, skipped: 1 });
    expect(ctx.storage.delete).not.toHaveBeenCalled();
});
it.each([null, [], { before: '2099-01-01' }, { retentionDays: 0 }])(
    'rejects supplied cleanup policy %j before storage or database access',
    async (data) => {
        const ctx = setup();
        await expect(ctx.service.process(data)).rejects.toThrow();
        expect(ctx.repository.expired).not.toHaveBeenCalled();
        expect(ctx.storage.delete).not.toHaveBeenCalled();
    },
);
it('retries a failed database finalization after objects have been removed', async () => {
    const ctx = setup();
    ctx.repository.finalize.mockRejectedValueOnce(new Error('database failure'));
    await expect(ctx.service.process({})).rejects.toThrow();
    expect(ctx.objects.size).toBe(0);
    expect(ctx.record()).not.toBeNull();
    expect(await ctx.service.process({})).toEqual({ deleted: 1, skipped: 0 });
});

it('skips a candidate already purged by another worker', async () => {
    const ctx = setup();
    await ctx.service.process({});
    ctx.repository.expired.mockResolvedValueOnce([{ id, deletedAt: cutoff }]);
    expect(await ctx.service.process({})).toEqual({ deleted: 0, skipped: 1 });
    expect(ctx.repository.finalize).toHaveBeenCalledOnce();
});
it('skips media re-trashed more recently than the cutoff', async () => {
    const ctx = setup();
    ctx.record().deletedAt = new Date('2026-09-10T00:00:00Z');
    expect(await ctx.service.process({})).toEqual({ deleted: 0, skipped: 1 });
    expect(ctx.storage.delete).not.toHaveBeenCalled();
});
it('validates the entire variant manifest before any object removal', async () => {
    const ctx = setup();
    ctx.repository.variantKeys = async () => [{ storageKey: 'original.jpg' }, { storageKey: '../unsafe' }];
    await expect(ctx.service.process({})).rejects.toThrow();
    expect(ctx.storage.delete).not.toHaveBeenCalled();
    expect(ctx.repository.finalize).not.toHaveBeenCalled();
});
