import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateEnvironment } from '#config/environment.js';

import { buildApp } from './app.js';

const apps = [];
it('closes an injected storage provider with the application', async () => {
    const storage = { close: vi.fn() };
    const app = createApp({ storage });
    await app.inject('/api/health');
    await app.close();
    expect(storage.close).toHaveBeenCalledTimes(1);
});
it('closes storage even if database shutdown fails', async () => {
    const storage = { close: vi.fn() };
    const database = {
        connect: vi.fn().mockResolvedValue(),
        disconnect: vi.fn().mockRejectedValue(new Error('Database disconnection failed')),
    };
    const app = createApp({ storage, database });
    await app.ready();
    await expect(app.close()).rejects.toThrow('Database disconnection failed');
    expect(storage.close).toHaveBeenCalledTimes(1);
});
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('database application lifecycle', () => {
    it('connects before serving and disconnects on close', async () => {
        const database = { connect: vi.fn().mockResolvedValue(), disconnect: vi.fn().mockResolvedValue() };
        const app = createApp({ database });
        await app.inject('/api/health');
        expect(database.connect).toHaveBeenCalledTimes(1);
        await app.close();
        expect(database.disconnect).toHaveBeenCalledTimes(1);
    });

    it('refuses to serve when database startup fails and still closes resources', async () => {
        const database = {
            connect: vi.fn().mockRejectedValue(new Error('Database connection failed')),
            disconnect: vi.fn().mockResolvedValue(),
        };
        const app = createApp({ database });
        await expect(app.ready()).rejects.toThrow('Database connection failed');
        await app.close();
        expect(database.disconnect).toHaveBeenCalledTimes(1);
    });
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
