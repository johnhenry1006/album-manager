import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app/authenticatedApp.testUtils.js';

const id = 'a0000000-0000-4000-8000-000000000001';

describe('favorite media HTTP mutations', () => {
    let app;
    afterEach(async () => app?.close());

    function setup({ live = true, failure } = {}) {
        const favorites = new Set();
        const tx = {
            $queryRaw: vi.fn(async () => {
                if (failure) throw failure;
                return live ? [{ id }] : [];
            }),
            favorite: {
                createMany: vi.fn(async ({ data }) => {
                    favorites.add(data.mediaId);
                    return { count: 1 };
                }),
                deleteMany: vi.fn(async ({ where }) => ({ count: Number(favorites.delete(where.mediaId)) })),
            },
        };
        const client = { $connect() {}, $transaction: vi.fn((run) => run(tx)) };
        app = buildApp({ logger: false, database: { client, connect() {}, disconnect() {} } });
        return { favorites, tx, client };
    }

    it('adds and removes a personal favorite with empty 204 responses on repeated requests', async () => {
        const { favorites } = setup();
        for (const method of ['POST', 'POST', 'DELETE', 'DELETE']) {
            const response = await app.inject({ method, url: `/api/media/${id}/favorite` });
            expect(response.statusCode).toBe(204);
            expect(response.body).toBe('');
            expect([...favorites]).toEqual(method === 'POST' ? [id] : []);
        }
    });

    it.each(['POST', 'DELETE'])('returns centralized 404 for absent/deleted media on %s', async (method) => {
        const { favorites, tx } = setup({ live: false });
        const response = await app.inject({ method, url: `/api/media/${id}/favorite` });
        expect(response.statusCode).toBe(404);
        expect(response.json().error).toBe('HTTP_ERROR');
        expect(favorites.size).toBe(0);
        expect(tx.favorite.createMany).not.toHaveBeenCalled();
        expect(tx.favorite.deleteMany).not.toHaveBeenCalled();
    });

    it.each(['POST', 'DELETE'])('validates input before persistence on %s', async (method) => {
        const { client } = setup();
        for (const request of [
            { url: '/api/media/not-a-uuid/favorite' },
            { url: `/api/media/${id}/favorite?userId=someone` },
            { url: `/api/media/${id}/favorite`, payload: { favorite: true } },
        ]) {
            const response = await app.inject({ method, ...request });
            expect(response.statusCode).toBe(400);
            expect(response.json().error).toBe('HTTP_ERROR');
        }
        expect(client.$transaction).not.toHaveBeenCalled();
    });

    it.each(['POST', 'DELETE'])('sanitizes repository failures on %s', async (method) => {
        setup({ failure: new Error('private database credentials') });
        const response = await app.inject({ method, url: `/api/media/${id}/favorite` });
        expect(response.statusCode).toBe(500);
        expect(response.json().error).toBe('INTERNAL_ERROR');
        expect(response.body).not.toContain('private database credentials');
    });

    it('does not register a favorites collection endpoint', async () => {
        setup();
        expect((await app.inject('/api/favorites')).statusCode).toBe(404);
    });
});
