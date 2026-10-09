import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app/app.js';
import { createMediaStorageDeletionService } from './mediaStorageDeletion.service.js';
import { createMediaTrashService } from './mediaTrash.service.js';

const id = 'c0000000-0000-4000-8000-000000000001';
const time = new Date('2026-10-08T00:00:00Z');

describe('trash HTTP and domain boundaries', () => {
    let app;
    afterEach(async () => app?.close());
    function setup({ deletedAt = null, durable = true, storageAvailable = true } = {}) {
        let record = { id, deletedAt, purgeStartedAt: null };
        const storage = { delete: vi.fn() };
        const repository = {
            durableTransactions: durable,
            transaction: vi.fn(async (run) => run(repository)),
            lockMedia: vi.fn(async () => record),
            update: vi.fn(async (_id, data) => Object.assign(record, data)),
            variantKeys: async () => [
                { storageKey: `media/2026/10/08/${id}/original/source.jpg` },
                { storageKey: `media/2026/10/08/${id}/preview/preview.webp` },
            ],
            finalize: vi.fn(async () => {
                record = null;
            }),
            findPage: vi.fn(async () => []),
            expired: vi.fn(async () => [{ id }]),
        };
        const service = createMediaTrashService({
            repository,
            storageDeletion: createMediaStorageDeletionService({ storage: storageAvailable ? storage : undefined }),
            now: () => time,
        });
        app = buildApp({ logger: false, mediaTrashService: service });
        const request = (method, suffix, payload) =>
            app.inject({ method, url: suffix, ...(payload === undefined ? {} : { payload }) });
        return { repository, storage, service, request, record: () => record };
    }

    it('preserves the original deletion timestamp on repeated soft deletes and never deletes objects', async () => {
        const context = setup();
        for (let n = 0; n < 2; n++) expect((await context.request('DELETE', `/api/media/${id}`)).statusCode).toBe(204);
        expect(context.record().deletedAt).toEqual(time);
        expect(context.repository.update).toHaveBeenCalledOnce();
        expect(context.storage.delete).not.toHaveBeenCalled();
        expect((await context.request('POST', `/api/trash/${id}/restore`)).statusCode).toBe(204);
        expect(context.record().deletedAt).toBeNull();
    });

    it('retains the manifest and prevents restore after a storage failure, then finishes a retry', async () => {
        const context = setup({ deletedAt: time });
        context.storage.delete.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('storage-secret'));
        const response = await context.request('DELETE', `/api/trash/${id}/permanent`, { confirm: true });
        expect(response.statusCode).toBe(500);
        expect(response.body).not.toContain('storage-secret');
        expect(context.record().purgeStartedAt).toEqual(time);
        expect(context.repository.finalize).not.toHaveBeenCalled();
        expect((await context.request('POST', `/api/trash/${id}/restore`)).statusCode).toBe(409);
        expect((await context.request('DELETE', `/api/trash/${id}/permanent`, { confirm: true })).statusCode).toBe(204);
        expect(context.record()).toBeNull();
    });

    it.each([
        ['DELETE', `/api/media/${id}?force=true`, undefined],
        ['DELETE', '/api/media/bad', undefined],
        ['POST', `/api/trash/${id}/restore`, {}],
        ['DELETE', `/api/trash/${id}/permanent`, undefined],
        ['DELETE', `/api/trash/${id}/permanent`, { confirm: 'true' }],
        ['DELETE', `/api/trash/${id}/permanent?force=true`, { confirm: true }],
        ['GET', '/api/trash?limit=201', undefined],
        ['GET', '/api/trash?limit=1&limit=2', undefined],
        ['GET', '/api/trash?cursor=bad', undefined],
        ['GET', '/api/trash?extra=true', undefined],
    ])('rejects %s %s before persistence', async (method, url, payload) => {
        const { repository, request } = setup();
        expect((await request(method, url, payload)).statusCode).toBe(400);
        expect(repository.transaction).not.toHaveBeenCalled();
        expect(repository.findPage).not.toHaveBeenCalled();
    });

    it.each([{ durable: false }, { storageAvailable: false }])(
        'refuses unsafe purge dependencies: %j',
        async (options) => {
            const context = setup({ ...options, deletedAt: time });
            expect((await context.request('DELETE', `/api/trash/${id}/permanent`, { confirm: true })).statusCode).toBe(
                options.durable === false ? 409 : 503,
            );
            expect(context.record().purgeStartedAt).toBeNull();
            expect(context.storage.delete).not.toHaveBeenCalled();
        },
    );

    it('returns a non-cacheable empty trash page', async () => {
        const { request } = setup();
        const response = await request('GET', '/api/trash');
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.json()).toEqual({ items: [], hasMore: false, nextCursor: null });
    });

    it('rechecks retention eligibility after candidate selection and skips a concurrent restore', async () => {
        const context = setup({ deletedAt: time });
        context.repository.expired.mockImplementation(async () => {
            context.record().deletedAt = null;
            return [{ id }];
        });
        expect(await context.service.cleanupExpired({ before: time })).toEqual({
            deleted: [],
            skipped: [id],
            failed: [],
        });
        expect(context.storage.delete).not.toHaveBeenCalled();
    });

    it.each([
        {},
        { before: '2026-01-01' },
        { before: new Date('2027-01-01') },
        { before: time, limit: 0 },
        { before: time, extra: true },
    ])('rejects invalid retention cleanup input %j', async (input) => {
        const context = setup();
        await expect(context.service.cleanupExpired(input)).rejects.toMatchObject({ statusCode: 400 });
        expect(context.repository.expired).not.toHaveBeenCalled();
    });

    it('reports failed cleanup candidates without exposing adapter errors', async () => {
        const context = setup({ deletedAt: time });
        context.storage.delete.mockRejectedValue(new Error('storage-secret'));
        expect(await context.service.cleanupExpired({ before: time })).toEqual({
            deleted: [],
            skipped: [],
            failed: [id],
        });
    });
});

it('validates every storage key before deletion and deduplicates recorded keys', async () => {
    const storage = { delete: vi.fn() };
    const service = createMediaStorageDeletionService({ storage });
    await expect(
        service.deleteVariants(
            [{ storageKey: `media/2026/10/08/${id}/original/valid.jpg` }, { storageKey: '../invalid' }],
            id,
        ),
    ).rejects.toThrow();
    expect(storage.delete).not.toHaveBeenCalled();
    await service.deleteVariants(
        [
            { storageKey: `media/2026/10/08/${id}/original/valid.jpg` },
            { storageKey: `media/2026/10/08/${id}/original/valid.jpg` },
        ],
        id,
    );
    expect(storage.delete).toHaveBeenCalledExactlyOnceWith({ key: `media/2026/10/08/${id}/original/valid.jpg` });
});

it('validates every purge key belongs to the selected media before any deletion', async () => {
    const storage = { delete: vi.fn() };
    const service = createMediaStorageDeletionService({ storage });
    const own = `media/2026/10/08/${id}/original/source.jpg`;
    const foreign = 'media/2026/10/08/a0000000-0000-4000-8000-000000000001/original/source.jpg';
    await expect(service.deleteVariants([{ storageKey: own }, { storageKey: foreign }], id)).rejects.toThrow();
    expect(storage.delete).not.toHaveBeenCalled();
});
