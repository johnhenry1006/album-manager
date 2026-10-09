import { afterEach, expect, it, vi } from 'vitest';

import { validateEnvironment } from '#config/environment.js';

import { buildApp } from './app.js';

const apps = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
function setup(environment = {}, options = {}) {
    const app = buildApp({ logger: false, config: validateEnvironment(environment), ...options });
    apps.push(app);
    return app;
}
it('sets secure non-cacheable API headers, including errors', async () => {
    const app = setup({ NODE_ENV: 'production' });
    for (const url of ['/api/health', '/api/missing']) {
        const response = await app.inject(url);
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(response.headers['content-security-policy']).toContain("default-src 'none'");
        expect(response.headers['cache-control']).toBe('no-store');
    }
});
it('allows configured origins and valid preflight without cookies', async () => {
    const app = setup({ FRONTEND_ORIGIN: 'https://album.example' });
    const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/uploads/sessions',
        headers: {
            origin: 'https://album.example',
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type',
        },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://album.example');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers.vary).toContain('Origin');
});
it.each(['https://evil.example', 'null', 'https://album.example.evil.test'])(
    'blocks %s before mutations',
    async (origin) => {
        const createSession = vi.fn();
        const app = setup({ FRONTEND_ORIGIN: 'https://album.example' }, { uploadService: { createSession } });
        const response = await app.inject({
            method: 'POST',
            url: '/api/uploads/sessions',
            headers: { origin },
            payload: {},
        });
        expect(response.statusCode).toBe(403);
        expect(createSession).not.toHaveBeenCalled();
    },
);
it('rejects unsupported preflight headers and methods', async () => {
    const app = setup({ FRONTEND_ORIGIN: 'https://album.example' });
    expect(
        (
            await app.inject({
                method: 'OPTIONS',
                url: '/api/health',
                headers: {
                    origin: 'https://album.example',
                    'access-control-request-method': 'TRACE',
                },
            })
        ).statusCode,
    ).toBe(403);
    expect(
        (
            await app.inject({
                method: 'OPTIONS',
                url: '/api/health',
                headers: {
                    origin: 'https://album.example',
                    'access-control-request-method': 'GET',
                    'access-control-request-headers': 'x-storage-secret',
                },
            })
        ).statusCode,
    ).toBe(403);
});
it('limits per-IP reads and mutations with a retry-after response', async () => {
    const app = setup(
        { API_RATE_LIMIT_MAX: '2', API_WRITE_RATE_LIMIT_MAX: '1' },
        {
            uploadService: { createSession: async () => ({ id: 'a', status: 'REGISTERED', createdAt: new Date() }) },
        },
    );
    expect((await app.inject('/api/health')).statusCode).toBe(200);
    expect((await app.inject('/api/health')).statusCode).toBe(200);
    const response = await app.inject('/api/health');
    expect(response.statusCode).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect((await app.inject({ url: '/api/health', remoteAddress: '127.0.0.2' })).statusCode).toBe(200);
    const second = setup(
        { API_WRITE_RATE_LIMIT_MAX: '1' },
        {
            uploadService: { createSession: async () => ({ id: 'a', status: 'REGISTERED', createdAt: new Date() }) },
        },
    );
    expect((await second.inject({ method: 'POST', url: '/api/uploads/sessions' })).statusCode).toBe(201);
    expect((await second.inject({ method: 'POST', url: '/api/uploads/sessions' })).statusCode).toBe(429);
});
it('rejects unknown upload fields, coercion and ignored query parameters', async () => {
    const registerFile = vi.fn();
    const createSession = vi.fn();
    const app = setup({}, { uploadService: { registerFile, createSession } });
    const url = '/api/uploads/sessions/a0000000-0000-4000-8000-000000000001/files';
    for (const payload of [
        { filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 100, storageKey: '../secret' },
        { filename: 123, mimeType: 'image/jpeg', fileSize: 100 },
    ])
        expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(400);
    expect(
        (await app.inject({ method: 'POST', url: '/api/uploads/sessions?key=secret', payload: {} })).statusCode,
    ).toBe(400);
    expect(registerFile).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
});
it('rejects oversized JSON, text bodies and unexpected input on bodyless routes', async () => {
    const app = setup();
    expect(
        (await app.inject({ method: 'POST', url: '/api/missing', payload: { data: 'x'.repeat(70000) } })).statusCode,
    ).toBe(413);
    expect(
        (
            await app.inject({
                method: 'POST',
                url: '/api/missing',
                headers: { 'content-type': 'text/plain' },
                payload: 'x',
            })
        ).statusCode,
    ).toBe(415);
    expect((await app.inject('/api/health?secret=x')).statusCode).toBe(400);
});
it.each(['*', 'null', 'https://name:secret@album.example', 'https://album.example/path', 'https://album.example?x=1'])(
    'rejects unsafe CORS configuration %s',
    (origin) => {
        expect(() => validateEnvironment({ FRONTEND_ORIGIN: origin })).toThrow(/configuration/);
    },
);

it('rejects multiple frontend origins to preserve the storage proxy origin contract', () => {
    expect(() => validateEnvironment({ FRONTEND_ORIGIN: 'http://localhost:5173,http://127.0.0.1:5173' })).toThrow(
        /configuration/,
    );
});

it.each(['/api/uploads/sessions', '/api/uploads/files/a0000000-0000-4000-8000-000000000001/presign'])(
    'rejects a JSON null body on %s instead of treating it as empty',
    async (url) => {
        const createSession = vi.fn();
        const presign = vi.fn();
        const app = setup({}, { uploadService: { createSession, presign } });
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url,
                    headers: { 'content-type': 'application/json' },
                    payload: 'null',
                })
            ).statusCode,
        ).toBe(400);
        expect(createSession).not.toHaveBeenCalled();
        expect(presign).not.toHaveBeenCalled();
    },
);
