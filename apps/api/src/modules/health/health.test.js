import { afterEach, describe, expect, it } from 'vitest';

import { validateEnvironment } from '#config/environment.js';

import { buildApp } from '../../app/authenticatedApp.testUtils.js';

const apps = [];
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp() {
    const app = buildApp({ config: validateEnvironment({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }) });
    apps.push(app);
    return app;
}

describe('GET /api/health', () => {
    it('returns JSON liveness status, a current ISO timestamp, and the application version', async () => {
        const app = createApp();
        const before = Date.now();
        const response = await app.inject({ method: 'GET', url: '/api/health' });
        const after = Date.now();
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('application/json');
        const body = response.json();
        expect(body.status).toBe('ok');
        expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
        expect(Date.parse(body.timestamp)).toBeGreaterThanOrEqual(before);
        expect(Date.parse(body.timestamp)).toBeLessThanOrEqual(after);
        expect(app.server.listening).toBe(false);
    });

    it('does not expose an unprefixed health route', async () => {
        const response = await createApp().inject({ method: 'GET', url: '/health' });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({ statusCode: 404, error: 'HTTP_ERROR', message: 'Route not found' });
        expect(response.json().requestId).toEqual(expect.any(String));
    });
});
