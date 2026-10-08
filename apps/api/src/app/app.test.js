import { Writable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { validateEnvironment } from '#config/environment.js';

import { buildApp } from './app.js';

const apps = [];
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp(options = {}) {
    const app = buildApp({ config: validateEnvironment({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }), ...options });
    apps.push(app);
    return app;
}

describe('application error handling', () => {
    it('sanitizes unexpected failures through the registered root handler', async () => {
        const app = createApp();
        app.get('/test-failure', async () => {
            throw new Error('private implementation detail');
        });
        const response = await app.inject('/test-failure');
        expect(response.statusCode).toBe(500);
        expect(response.json()).toMatchObject({
            statusCode: 500,
            error: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
        expect(response.json().requestId).toEqual(expect.any(String));
        expect(response.body).not.toContain('private implementation detail');
        expect(response.body).not.toContain('stack');
    });

    it('centralizes validation errors without exposing rejected input', async () => {
        const app = createApp();
        app.post(
            '/test-validation',
            {
                schema: { body: { type: 'object', required: ['count'], properties: { count: { type: 'integer' } } } },
            },
            async () => ({ accepted: true }),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/test-validation',
            payload: { count: 'sensitive-value' },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR', message: 'Invalid request input' });
        expect(response.body).not.toContain('sensitive-value');
    });
});

it('logs incoming requests and their completion', async () => {
    const lines = [];
    const stream = new Writable({
        write(chunk, _encoding, callback) {
            lines.push(chunk.toString());
            callback();
        },
    });
    const app = createApp({ logger: { level: 'info', stream } });
    await app.inject('/api/health');
    const records = lines
        .join('')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
    expect(records.some((record) => record.req?.url === '/api/health')).toBe(true);
    expect(records.some((record) => record.res?.statusCode === 200)).toBe(true);
});
