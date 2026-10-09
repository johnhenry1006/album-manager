import { afterEach, expect, it, vi } from 'vitest';

import { buildApp } from '../../app/authenticatedApp.testUtils.js';

const sessionId = 'a0000000-0000-4000-8000-000000000001';
const uploadFileId = 'a0000000-0000-4000-8000-000000000002';
const mediaId = 'a0000000-0000-4000-8000-000000000003';
const apps = [];
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});
function setup() {
    const session = { id: sessionId, status: 'REGISTERED', createdAt: new Date(), completedAt: null };
    const file = {
        id: uploadFileId,
        uploadSessionId: sessionId,
        status: 'REGISTERED',
        clientFilename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100n,
        createdAt: new Date(),
        updatedAt: new Date(),
        storageKey: 'private',
        error: 'private',
    };
    const service = {
        createSession: vi.fn(async () => session),
        registerFile: vi.fn(async () => file),
        presign: vi.fn(async () => ({
            uploadFileId,
            status: 'UPLOADING',
            method: 'PUT',
            url: 'https://storage.test',
            headers: { 'content-type': 'image/jpeg' },
            expiresIn: 900,
        })),
        complete: vi.fn(async () => ({ uploadFileId, mediaId, status: 'PROCESSING' })),
        loadSession: vi.fn(async () => ({ ...session, files: [file], nextCursor: null })),
    };
    const app = buildApp({ logger: false, uploadService: service });
    apps.push(app);
    return { app, service };
}
it('creates a session over HTTP', async () => {
    const { app } = setup();
    const response = await app.inject({ method: 'POST', url: '/api/uploads/sessions', payload: {} });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ sessionId, status: 'REGISTERED' });
});
it('registers metadata with a serializable file identifier', async () => {
    const { app, service } = setup();
    const response = await app.inject({
        method: 'POST',
        url: `/api/uploads/sessions/${sessionId}/files`,
        payload: { filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 100 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ uploadFileId, fileSize: '100' });
    expect(response.body).not.toContain('private');
    expect(service.registerFile).toHaveBeenCalledWith(sessionId, {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100,
    });
});
it('rejects invalid metadata and binary requests before invoking services', async () => {
    const { app, service } = setup();
    const bad = await app.inject({
        method: 'POST',
        url: `/api/uploads/sessions/${sessionId}/files`,
        payload: { filename: 'photo.jpg', fileSize: -1 },
    });
    expect(bad.statusCode).toBe(400);
    expect(service.registerFile).not.toHaveBeenCalled();
    const binary = await app.inject({
        method: 'POST',
        url: `/api/uploads/sessions/${sessionId}/files`,
        headers: { 'content-type': 'image/jpeg' },
        payload: Buffer.from('binary'),
    });
    expect(binary.statusCode).toBe(415);
});
it('returns presigned PUT details and a complete response for frontend tracking', async () => {
    const { app } = setup();
    const presign = await app.inject({
        method: 'POST',
        url: `/api/uploads/files/${uploadFileId}/presign`,
        payload: {},
    });
    expect(presign.statusCode).toBe(200);
    expect(presign.json()).toMatchObject({ uploadFileId, method: 'PUT' });
    const completion = await app.inject({
        method: 'POST',
        url: `/api/uploads/files/${uploadFileId}/complete`,
        payload: {},
    });
    expect(completion.statusCode).toBe(202);
    expect(completion.json()).toEqual({ uploadFileId, status: 'PROCESSING', mediaId });
});
it('loads a paginated session without exposing storage internals', async () => {
    const { app, service } = setup();
    const response = await app.inject(`/api/uploads/sessions/${sessionId}?limit=10`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sessionId, files: [{ uploadFileId }], nextCursor: null });
    expect(service.loadSession).toHaveBeenCalledWith(sessionId, { limit: 10 });
    expect(response.body).not.toContain('private');
});

it('accepts empty POST requests for session, presign and completion', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/uploads/sessions' })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/api/uploads/files/${uploadFileId}/presign` })).statusCode).toBe(
        200,
    );
    expect((await app.inject({ method: 'POST', url: `/api/uploads/files/${uploadFileId}/complete` })).statusCode).toBe(
        202,
    );
});

it.each([
    ['SKIP', 'CANCELLED', null, 200],
    ['USE_EXISTING', 'READY', mediaId, 200],
    ['KEEP_BOTH', 'PROCESSING', null, 202],
])('exposes the duplicate resolution contract for %s', async (action, status, finalMediaId, code) => {
    const { app, service } = setup();
    service.resolveDuplicate = vi.fn(async () => ({
        uploadFileId,
        status,
        finalMediaId,
        duplicateOfMediaId: mediaId,
        storageKey: 'private',
    }));
    const response = await app.inject({
        method: 'POST',
        url: `/api/uploads/files/${uploadFileId}/duplicate/resolve`,
        payload: { action },
    });
    expect(response.statusCode).toBe(code);
    expect(response.json()).toEqual({ uploadFileId, status, finalMediaId, duplicateOfMediaId: mediaId });
    expect(service.resolveDuplicate).toHaveBeenCalledWith(uploadFileId, { action });
});
it.each([{}, { action: 'DELETE' }, { action: 'SKIP', extra: true }])(
    'rejects invalid duplicate actions over HTTP %j',
    async (payload) => {
        const { app, service } = setup();
        service.resolveDuplicate = vi.fn();
        const response = await app.inject({
            method: 'POST',
            url: `/api/uploads/files/${uploadFileId}/duplicate/resolve`,
            payload,
        });
        expect(response.statusCode).toBe(400);
        expect(service.resolveDuplicate).not.toHaveBeenCalled();
    },
);
