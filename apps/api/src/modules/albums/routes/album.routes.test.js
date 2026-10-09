import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp, TEST_ACTOR } from '../../../app/authenticatedApp.testUtils.js';
import { fixture } from '../services/album.testUtils.js';

const albumId = 'a0000000-0000-4000-8000-000000000001';
const mediaId = 'b0000000-0000-4000-8000-000000000001';

describe('album HTTP routes', () => {
    let app;
    afterEach(async () => app?.close());

    it.each([
        ['GET', '/albums?q=trip', undefined, 'list', [{ q: 'trip' }], 200],
        ['POST', '/albums', { name: 'Trip' }, 'create', [{ name: 'Trip' }], 201],
        ['GET', `/albums/${albumId}`, undefined, 'detail', [albumId], 200],
        ['PATCH', `/albums/${albumId}`, { coverMediaId: mediaId }, 'update', [albumId, { coverMediaId: mediaId }], 200],
        ['DELETE', `/albums/${albumId}`, undefined, 'remove', [albumId], 204],
        ['GET', `/albums/${albumId}/media?limit=2`, undefined, 'listMedia', [albumId, { limit: '2' }], 200],
        [
            'POST',
            `/albums/${albumId}/media`,
            { mediaId, position: 5 },
            'addMedia',
            [albumId, { mediaId, position: 5 }],
            200,
        ],
        ['DELETE', `/albums/${albumId}/media/${mediaId}`, undefined, 'removeMedia', [albumId, mediaId], 204],
    ])('%s %s delegates validated input to the module', async (method, url, payload, action, args, status) => {
        const service = { [action]: vi.fn().mockResolvedValue({ ok: true }) };
        app = buildApp({ logger: false, albumService: service });
        const response = await app.inject({ method, url: `/api${url}`, payload });
        expect(response.statusCode).toBe(status);
        expect(service[action]).toHaveBeenCalledWith(...args, ...(action === 'listMedia' ? [TEST_ACTOR] : []));
        if (status === 204) expect(response.body).toBe('');
        else expect(response.json()).toEqual({ ok: true });
    });

    it.each([400, 404, 409, 500])('uses centralized handling for %s failures', async (statusCode) => {
        app = buildApp({
            logger: false,
            albumService: {
                detail: async () => {
                    throw Object.assign(new Error('private database detail'), { statusCode });
                },
            },
        });
        const response = await app.inject(`/api/albums/${albumId}`);
        expect(response.statusCode).toBe(statusCode);
        expect(response.json()).toMatchObject({ statusCode, requestId: expect.any(String) });
        expect(response.body).not.toContain('private database detail');
    });
    it.each([
        ['GET', '/albums?limit=0', undefined],
        ['GET', '/albums?page=1&page=2', undefined],
        ['GET', '/albums?unknown=1', undefined],
        ['POST', '/albums', { name: '' }],
        ['POST', '/albums', { name: 'Name', deletedAt: null }],
        ['POST', '/albums', undefined],
        ['GET', '/albums/bad', undefined],
        ['PATCH', `/albums/${albumId}`, {}],
        ['PATCH', `/albums/${albumId}`, { coverMediaId: 'bad' }],
        ['DELETE', '/albums/bad', undefined],
        ['GET', `/albums/${albumId}/media?limit=201`, undefined],
        ['GET', `/albums/${albumId}/media?cursor=bad`, undefined],
        ['POST', `/albums/${albumId}/media`, { mediaId, position: -1 }],
        ['POST', `/albums/${albumId}/media`, { mediaId, position: '1' }],
        ['DELETE', `/albums/${albumId}/media/bad`, undefined],
    ])('rejects invalid %s %s with HTTP 400', async (method, url, payload) => {
        const { service, reads } = fixture();
        app = buildApp({ logger: false, albumService: service });
        const response = await app.inject({ method, url: `/api${url}`, payload });
        expect(response.statusCode).toBe(400);
        expect(reads()).toBe(0);
        expect(response.json()).toMatchObject({ statusCode: 400, requestId: expect.any(String) });
    });

    it('maps cover membership and slug conflicts through centralized handling', async () => {
        const { service } = fixture();
        app = buildApp({ logger: false, albumService: service });
        expect(
            (await app.inject({ method: 'PATCH', url: `/api/albums/${albumId}`, payload: { coverMediaId: mediaId } }))
                .statusCode,
        ).toBe(400);
        expect(
            (await app.inject({ method: 'POST', url: '/api/albums', payload: { name: 'Duplicate', slug: 'trip' } }))
                .statusCode,
        ).toBe(409);
    });
});
