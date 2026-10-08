import { randomUUID } from 'node:crypto';

import { vi } from 'vitest';

import { validateUploadEnvironment } from '#config/uploads.js';
import {
    createMediaService,
    createMediaUploadCleanupService,
    createMediaVariantService,
} from '#modules/media/index.js';

import { createUploadService } from '../index.js';

export function fixture(policy = {}) {
    const sessions = new Map();
    const files = new Map();
    const media = new Map();
    const variants = new Map();
    const repository = {
        async createSession() {
            const row = { id: randomUUID(), status: 'REGISTERED', createdAt: new Date(), completedAt: null };
            sessions.set(row.id, row);
            return row;
        },
        async findSession(id) {
            return sessions.get(id) ?? null;
        },
        async updateSession(id, data) {
            Object.assign(sessions.get(id), data);
        },
        async countFiles(id) {
            return [...files.values()].filter((file) => file.uploadSessionId === id).length;
        },
        async createFile(data) {
            const row = {
                id: randomUUID(),
                status: 'REGISTERED',
                createdAt: new Date(),
                updatedAt: new Date(),
                mediaId: null,
                storageKey: null,
                error: null,
                ...data,
            };
            files.set(row.id, row);
            return row;
        },
        async findFile(id) {
            return files.get(id) ?? null;
        },
        async updateFile(id, data) {
            return Object.assign(files.get(id), data);
        },
        async listFiles(id, { limit }) {
            return [...files.values()].filter((file) => file.uploadSessionId === id).slice(0, limit + 1);
        },
        async fileStatuses(id) {
            return [...files.values()].filter((file) => file.uploadSessionId === id).map((file) => file.status);
        },
    };
    const mediaService = createMediaService({
        repository: {
            async create(data) {
                const row = { id: randomUUID(), createdAt: new Date(), ...data };
                media.set(row.id, row);
                return row;
            },
            async findById(id) {
                return media.get(id);
            },
        },
    });
    const mediaVariantService = createMediaVariantService({
        mediaService,
        repository: {
            async createOriginal(data) {
                const row = { id: randomUUID(), ...data };
                variants.set(row.id, row);
                return row;
            },
        },
    });
    const cleanupRepository = {
        async findOriginal(id) {
            return [...variants.values()].find((variant) => variant.mediaId === id && variant.type === 'ORIGINAL');
        },
        async loadCandidate(id) {
            const row = media.get(id);
            return row && row.status === 'PENDING' && !row.referenced && !row.deletedAt
                ? { ...row, variants: [...variants.values()].filter((variant) => variant.mediaId === id) }
                : null;
        },
        async keyIsReferenced() {
            return false;
        },
        async originalHasUploadAlias() {
            return false;
        },
        async retire(id) {
            media.get(id).deletedAt = new Date();
        },
    };
    const storage = {
        delete: vi.fn(async () => {}),
        createPresignedUploadUrl: vi.fn(async () => ({
            url: 'https://storage.test/upload',
            method: 'PUT',
            headers: { 'content-type': 'image/jpeg' },
            expiresIn: 900,
        })),
        getObjectMetadata: vi.fn(async ({ key }) => ({
            key,
            fileSize: 100,
            contentType: 'image/jpeg',
            etag: '"etag"',
        })),
        copyObject: vi.fn(async () => ({})),
    };
    const queue = { enqueueMediaProcessing: vi.fn(async () => ({ id: 'job' })) };
    const mediaUploadCleanupService = createMediaUploadCleanupService({ repository: cleanupRepository, storage });
    let pending = Promise.resolve();
    function locked(_id, run) {
        const result = pending.then(() =>
            run({ repository, mediaService, mediaVariantService, mediaUploadCleanupService, cleanupRepository }),
        );
        pending = result.catch(() => {});
        return result;
    }
    const service = createUploadService({
        repository,
        storage,
        queue,
        config: { ...validateUploadEnvironment({}), ...policy },
        withSessionLock: locked,
        withFileLock: locked,
    });
    return { service, repository, storage, queue, sessions, files, media, variants };
}
