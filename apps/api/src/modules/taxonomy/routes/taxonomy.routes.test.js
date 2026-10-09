import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app/app.js';

const id = 'a0000000-0000-4000-8000-000000000001';
let app;
afterEach(async () => app?.close());

describe.each(['categories', 'tags'])('%s HTTP boundary', (kind) => {
    function setup() {
        const service = Object.fromEntries(
            ['list', 'create', 'update', 'remove', 'assignMedia', 'assignBatch'].map((name) => [name, vi.fn()]),
        );
        app = buildApp({ logger: false, taxonomyService: { [kind]: service } });
        return service;
    }

    it.each([
        ['POST', (kind) => `/api/${kind}?force=true`, { name: 'Travel' }],
        ['PATCH', (kind) => `/api/${kind}/${id}?force=true`, { name: 'Travel' }],
        ['DELETE', (kind) => `/api/${kind}/${id}?force=true`, undefined],
        ['DELETE', (kind) => `/api/${kind}/${id}`, {}],
        ['POST', (kind) => `/api/media/${id}/${kind}?force=true`, {}],
        ['POST', (kind) => `/api/media/${kind}?force=true`, {}],
    ])('rejects unsupported input on %s before invoking domain actions', async (method, url, payload) => {
        const service = setup();
        const response = await app.inject({ method, url: url(kind), ...(payload === undefined ? {} : { payload }) });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: 'HTTP_ERROR', requestId: expect.any(String) });
        for (const action of Object.values(service)) expect(action).not.toHaveBeenCalled();
    });

    it('routes service failures through centralized sanitization', async () => {
        const service = setup();
        service.create.mockRejectedValue(new Error('private database credentials'));
        const response = await app.inject({ method: 'POST', url: `/api/${kind}`, payload: { name: 'Travel' } });
        expect(response.statusCode).toBe(500);
        expect(response.json()).toMatchObject({ error: 'INTERNAL_ERROR', requestId: expect.any(String) });
        expect(response.body).not.toContain('private database credentials');
    });
});
