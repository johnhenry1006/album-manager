import { describe, expect, it } from 'vitest';

import { normalizeVector } from '../validators/semantic.validator.js';
import { createSemanticIndexingService } from './semanticIndexing.service.js';
import { createSemanticSearchService } from './semanticSearch.service.js';

const id = 'a0000000-0000-4000-8000-000000000001';
const second = 'a0000000-0000-4000-8000-000000000002';
const profile = { space: 'fixture-v1', model: 'fixture-1', dimensions: 2 };
function setup({ vector = [3, 4], tags = [{ label: 'beach', confidence: 0.9 }] } = {}) {
    let source = { id, checksum: 'a'.repeat(64), mimeType: 'image/jpeg', storageKey: 'existing/source.jpg' };
    let record;
    const repository = {
        loadSource: async () => source,
        getIndex: async () => record,
        save: async (input) => {
            record = input;
            return Boolean(source);
        },
        fail: async (input) => {
            record = { ...input, status: 'FAILED', errorCode: 'SEMANTIC_INDEX_FAILED' };
        },
        findCandidates: async () => [id, second],
    };
    const provider = { profile, embedImage: async () => vector, embedText: async () => vector };
    const service = createSemanticIndexingService({
        repository,
        storage: { read: async () => Buffer.from('image') },
        embeddingProvider: provider,
        tagProvider: { revision: 'tags-v1', tagImage: async () => tags },
    });
    return {
        service,
        repository,
        provider,
        record: () => record,
        remove: () => {
            source = null;
        },
    };
}

describe('semantic indexing isolation', () => {
    it('persists normalized vectors and separate generated tags, and reuses unchanged records', async () => {
        const ctx = setup();
        expect(await ctx.service.index({ mediaId: id })).toEqual({ status: 'READY', mediaId: id });
        expect(ctx.record()).toMatchObject({
            mediaId: id,
            vector: [0.6, 0.8],
            tags: [{ label: 'beach', confidence: 0.9 }],
            tagRevision: 'tags-v1',
        });
        ctx.provider.embedImage = async () => {
            throw new Error('must reuse');
        };
        expect((await ctx.service.index({ mediaId: id })).status).toBe('UNCHANGED');
    });
    it('records a safe independent failure without exposing provider details', async () => {
        const ctx = setup({ vector: [NaN, 2] });
        await expect(ctx.service.index({ mediaId: id })).rejects.toMatchObject({ statusCode: 503 });
        expect(ctx.record()).toMatchObject({ status: 'FAILED', errorCode: 'SEMANTIC_INDEX_FAILED' });
        expect(JSON.stringify(ctx.record())).not.toContain('NaN');
    });
    it('skips deleted sources and validates jobs before reading media', async () => {
        const ctx = setup();
        ctx.remove();
        expect((await ctx.service.index({ mediaId: id })).status).toBe('SKIPPED');
        await expect(ctx.service.index({ mediaId: '../private' })).rejects.toMatchObject({ statusCode: 400 });
    });
    it('continues reconciliation after one image fails', async () => {
        const ctx = setup();
        let count = 0;
        ctx.provider.embedImage = async () => {
            if (++count === 1) throw new Error('private');
            return [1, 0];
        };
        expect(await ctx.service.reconcile({})).toEqual({ processed: 2, failed: 1 });
    });
    it('rejects invalid provider tags instead of publishing them', async () => {
        const ctx = setup({ tags: [{ label: 'bad', confidence: 2 }] });
        await expect(ctx.service.index({ mediaId: id })).rejects.toMatchObject({ statusCode: 503 });
    });
});

describe('semantic search contracts', () => {
    it.each([[0, 0], [Infinity, 1], [1], [1, '2']].map((vector) => ({ vector })))(
        'rejects unusable vector $vector',
        ({ vector }) => {
            expect(() => normalizeVector(vector, profile)).toThrow();
        },
    );
    it('searches text in the same image embedding space and binds pagination to the query', async () => {
        const ctx = setup();
        const service = createSemanticSearchService({
            repository: ctx.repository,
            embeddingProvider: ctx.provider,
            vectorIndex: {
                search: async ({ vector, cursor }) => {
                    expect(vector).toEqual([0.6, 0.8]);
                    return cursor
                        ? [{ id: second, score: 0.5 }]
                        : [
                              { id, score: 1 },
                              { id: second, score: 0.5 },
                          ];
                },
            },
        });
        const page = await service.text({ text: 'beach', limit: 1 });
        expect(page.items).toEqual([{ id, score: 1 }]);
        expect(page.nextCursor).toBeTypeOf('string');
        expect((await service.text({ text: 'beach', limit: 1, cursor: page.nextCursor })).items).toEqual([
            { id: second, score: 0.5 },
        ]);
        await expect(service.text({ text: 'mountain', cursor: page.nextCursor })).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(service.text({ text: '', limit: 1000 })).rejects.toMatchObject({ statusCode: 400 });
    });
    it('rejects incompatible source embeddings and excludes the similarity source', async () => {
        const ctx = setup();
        await ctx.service.index({ mediaId: id });
        const service = createSemanticSearchService({
            repository: ctx.repository,
            embeddingProvider: ctx.provider,
            vectorIndex: {
                search: async ({ excludeId }) => {
                    expect(excludeId).toBe(id);
                    return [{ id: second, score: 0.8 }];
                },
            },
        });
        expect((await service.similar(id, {})).items).toEqual([{ id: second, score: 0.8 }]);
        ctx.record().model = 'other-model';
        await expect(service.similar(id, {})).rejects.toMatchObject({ statusCode: 409 });
    });
    it('returns generated tags with provenance, without leaking vectors or storage keys', async () => {
        const ctx = setup();
        await ctx.service.index({ mediaId: id });
        const service = createSemanticSearchService({ repository: ctx.repository, embeddingProvider: ctx.provider });
        expect(await service.tags(id)).toEqual({
            mediaId: id,
            tags: [{ label: 'beach', confidence: 0.9 }],
            space: profile.space,
            model: profile.model,
            tagRevision: 'tags-v1',
        });
        ctx.remove();
        await expect(service.tags(id)).rejects.toMatchObject({ statusCode: 404 });
    });
});
it('bounds provider calls so a stalled encoder does not block reconciliation forever', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
        const ctx = setup();
        ctx.provider.embedImage = async () => new Promise(() => {});
        const indexing = ctx.service.index({ mediaId: id });
        const assertion = expect(indexing).rejects.toMatchObject({ statusCode: 503 });
        await vi.advanceTimersByTimeAsync(30000);
        await assertion;
        expect(ctx.record().status).toBe('FAILED');
    } finally {
        vi.useRealTimers();
    }
});
it('normalizes finite vectors across very small and very large magnitudes', () => {
    for (const value of [Number.MIN_VALUE, Number.MAX_VALUE]) {
        const normalized = normalizeVector([value, value], profile);
        expect(normalized[0]).toBeCloseTo(0.7071067811865475, 14);
        expect(normalized[1]).toBeCloseTo(0.7071067811865475, 14);
    }
});
it('rejects malformed reconciliation payloads', async () => {
    const ctx = setup();
    for (const input of [[], 1, 'text', null, { mediaId: id }])
        await expect(ctx.service.reconcile(input)).rejects.toMatchObject({ statusCode: 400 });
});
