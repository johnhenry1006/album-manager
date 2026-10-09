import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
const actor = { id: 'a0000000-0000-4000-8000-000000000001', email: 'a@example.com' };
const token = 'a'.repeat(43);
let app;
afterEach(async () => {
    await app?.close();
});
function makeApp() {
    let revoked = false;
    return buildApp({
        logger: false,
        authService: {
            async login() {
                return { user: actor, csrfToken: 'csrf', token };
            },
            async authenticate(value) {
                if (value !== token || revoked) throw Object.assign(new Error(), { statusCode: 401 });
                return { user: actor, csrfToken: 'csrf' };
            },
            async logout() {
                revoked = true;
            },
        },
        mediaFavoriteService: { async add() {}, async remove() {} },
        mediaListService: {
            async list() {
                return { items: [] };
            },
        },
    });
}
describe('central authentication boundary', () => {
    it('protects reads and bodyless writes and revokes logout', async () => {
        app = makeApp();
        expect((await app.inject('/api/health')).statusCode).toBe(200);
        expect((await app.inject('/api/media')).statusCode).toBe(401);
        const login = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            headers: { 'x-auth-request': '1' },
            payload: { email: actor.email, password: 'a very long password' },
        });
        expect(login.statusCode).toBe(200);
        expect(login.json()).toEqual({ user: actor, csrfToken: 'csrf' });
        expect(login.headers['set-cookie']).toContain('HttpOnly');
        const headers = { cookie: `album_session=${token}` };
        expect((await app.inject({ url: '/api/auth/me', headers })).json().user).toEqual(actor);
        const url = '/api/media/a0000000-0000-4000-8000-000000000001/favorite';
        expect((await app.inject({ method: 'POST', url, headers })).statusCode).toBe(403);
        expect(
            (await app.inject({ method: 'POST', url, headers: { ...headers, 'x-csrf-token': 'csrf' } })).statusCode,
        ).toBe(204);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/auth/logout',
                    headers: { ...headers, 'x-csrf-token': 'csrf' },
                })
            ).statusCode,
        ).toBe(204);
        expect((await app.inject({ url: '/api/media', headers })).statusCode).toBe(401);
    });
    it('requires the login header and rejects unknown credential fields', async () => {
        app = makeApp();
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/auth/login',
                    payload: { email: actor.email, password: 'a very long password' },
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/auth/login',
                    headers: { 'x-auth-request': '1' },
                    payload: { email: actor.email, password: 'a very long password', userId: actor.id },
                })
            ).statusCode,
        ).toBe(400);
    });
    it('fails closed when business services have no auth dependency', () => {
        expect(() => buildApp({ logger: false, mediaListService: {} })).toThrow();
    });
});
it.each([
    '/api/albums',
    '/api/dashboard',
    '/api/categories',
    '/api/tags',
    '/api/uploads/sessions',
    '/api/trash',
    '/api/settings/storage',
    '/api/settings/image-optimization',
    '/api/media/a0000000-0000-4000-8000-000000000001',
])('protects composed business route %s', async (url) => {
    const service = new Proxy({}, { get: () => async () => ({}) });
    app = buildApp({
        logger: false,
        authService: {
            authenticate: async () => {
                throw Object.assign(new Error(), { statusCode: 401 });
            },
        },
        albumService: service,
        dashboardService: service,
        taxonomyService: service,
        uploadService: service,
        mediaTrashService: service,
        storageStatisticsService: service,
        imageOptimizationSettingsService: service,
        mediaDetailService: service,
    });
    expect((await app.inject({ url, method: url === '/api/uploads/sessions' ? 'POST' : 'GET' })).statusCode).toBe(401);
});
