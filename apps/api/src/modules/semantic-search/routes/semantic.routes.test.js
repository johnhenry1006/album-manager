import { afterEach, expect, it } from 'vitest';

import { buildApp as buildRawApp } from '../../../app/app.js';
import { buildApp } from '../../../app/authenticatedApp.testUtils.js';

const id = 'a0000000-0000-4000-8000-000000000001';
let app;
afterEach(async () => app?.close());
it('does not register semantic routes by default', async () => {
    app = buildApp({ logger: false });
    expect((await app.inject('/api/media/' + id + '/similar')).statusCode).toBe(404);
});
it('requires authentication for injected semantic services', () => {
    expect(() => buildRawApp({ logger: false, semanticSearchService: {} })).toThrow('Authentication');
});
it('registers independent text, similarity and semantic tag endpoints', async () => {
    app = buildApp({
        logger: false,
        semanticSearchService: {
            text: async () => ({ items: [{ id, score: 0.75 }], nextCursor: null }),
            similar: async (mediaId) => ({ items: [{ id: mediaId, score: 0.5 }], nextCursor: null }),
            tags: async (mediaId) => ({ mediaId, tags: [{ label: 'beach', confidence: 0.9 }] }),
        },
    });
    const response = await app.inject({ method: 'POST', url: '/api/semantic-search', payload: { text: 'beach' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toEqual([{ id, score: 0.75 }]);
    expect((await app.inject('/api/media/' + id + '/similar')).statusCode).toBe(200);
    expect((await app.inject('/api/media/' + id + '/semantic-tags')).json().tags[0].label).toBe('beach');
});
it('rejects anonymous requests', async () => {
    app = buildRawApp({
        logger: false,
        authService: {
            authenticate: async () => {
                throw Object.assign(new Error('Unauthenticated'), { statusCode: 401 });
            },
        },
        semanticSearchService: { similar: async () => ({}) },
    });
    expect((await app.inject('/api/media/' + id + '/similar')).statusCode).toBe(401);
});
it('validates inputs before calling injected services', async () => {
    app = buildApp({
        logger: false,
        semanticSearchService: {
            text: async () => {
                throw new Error('invalid input reached service');
            },
            similar: async () => {
                throw new Error('invalid input reached service');
            },
            tags: async () => {
                throw new Error('invalid input reached service');
            },
        },
    });
    for (const payload of [
        { text: '' },
        { text: 'beach', limit: 101 },
        { text: 'beach', extra: 'unknown' },
        { text: ['beach'] },
    ])
        expect((await app.inject({ method: 'POST', url: '/api/semantic-search', payload })).statusCode).toBe(400);
    expect((await app.inject('/api/media/not-a-uuid/similar')).statusCode).toBe(400);
    expect((await app.inject('/api/media/' + id + '/similar?limit=0')).statusCode).toBe(400);
});
