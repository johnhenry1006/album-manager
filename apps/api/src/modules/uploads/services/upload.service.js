import { generateStorageKey } from '#infrastructure/storage/index.js';

import { validateUploadFile, validateUploadId, validateUploadPage } from '../validators/upload.validator.js';
import { invalidUpload, uploadConflict, UploadError, uploadNotFound } from './upload.errors.js';

function completion(file) {
    return { uploadFileId: file.id, status: file.status, mediaId: file.mediaId };
}
function accepted(file) {
    return ['PROCESSING', 'READY'].includes(file.status) && file.mediaId;
}
function sessionStatus(states) {
    if (!states.length) return 'REGISTERED';
    if (states.some((state) => ['REGISTERED', 'UPLOADING'].includes(state))) return 'UPLOADING';
    if (states.some((state) => ['PROCESSING', 'DUPLICATE_PENDING'].includes(state))) return 'PROCESSING';
    if (states.includes('FAILED')) return 'FAILED';
    if (states.every((state) => state === 'CANCELLED')) return 'CANCELLED';
    return 'COMPLETED';
}
async function refreshSession(repository, id) {
    const status = sessionStatus(await repository.fileStatuses(id));
    await repository.updateSession(id, { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) });
}
export function createUploadService({ repository, storage, queue, config, withSessionLock, withFileLock }) {
    return Object.freeze({
        async createSession(input = {}) {
            if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)
                throw invalidUpload();
            return repository.createSession();
        },
        async registerFile(sessionId, input) {
            validateUploadId(sessionId);
            const data = validateUploadFile(input, config);
            return withSessionLock(sessionId, async ({ repository: scoped }) => {
                const session = await scoped.findSession(sessionId);
                if (!session) throw uploadNotFound();
                if (!['REGISTERED', 'UPLOADING'].includes(session.status)) throw uploadConflict();
                if ((await scoped.countFiles(sessionId)) >= config.maxFilesPerSession)
                    throw invalidUpload('Upload session file limit exceeded');
                const file = await scoped.createFile({
                    uploadSessionId: sessionId,
                    clientFilename: data.filename,
                    mimeType: data.mimeType,
                    fileSize: data.fileSize,
                });
                await scoped.updateSession(sessionId, { status: 'UPLOADING' });
                return file;
            });
        },
        async presign(uploadFileId) {
            validateUploadId(uploadFileId);
            return withFileLock(uploadFileId, async ({ repository: scoped }) => {
                const file = await scoped.findFile(uploadFileId);
                if (!file) throw uploadNotFound();
                if (!['REGISTERED', 'UPLOADING'].includes(file.status) || file.mediaId) throw uploadConflict();
                validateUploadFile(
                    { filename: file.clientFilename, mimeType: file.mimeType, fileSize: file.fileSize },
                    config,
                );
                const key = file.storageKey ?? `uploads/${file.uploadSessionId}/${file.id}/source`;
                const signed = await storage.createPresignedUploadUrl({
                    key,
                    contentType: file.mimeType,
                    expiresIn: config.urlExpirySeconds,
                });
                await scoped.updateFile(file.id, { storageKey: key, status: 'UPLOADING', error: null });
                return { uploadFileId: file.id, status: 'UPLOADING', ...signed };
            });
        },
        async complete(uploadFileId) {
            validateUploadId(uploadFileId);
            const prepared = await withFileLock(
                uploadFileId,
                async ({ repository: scoped, mediaService, mediaVariantService }) => {
                    const file = await scoped.findFile(uploadFileId);
                    if (!file) throw uploadNotFound();
                    if (accepted(file)) return { file, enqueue: false };
                    if (file.status !== 'UPLOADING' || !file.storageKey) throw uploadConflict();
                    if (file.mediaId) return { file, enqueue: true };
                    const data = validateUploadFile(
                        { filename: file.clientFilename, mimeType: file.mimeType, fileSize: file.fileSize },
                        config,
                    );
                    const object = await storage.getObjectMetadata({ key: file.storageKey });
                    if (!object) throw new UploadError('UPLOAD_OBJECT_MISSING', 'Upload object is missing', 409);
                    if (
                        !Number.isSafeInteger(object.fileSize) ||
                        BigInt(object.fileSize) !== data.fileSize ||
                        object.contentType?.toLowerCase() !== data.mimeType ||
                        !object.etag
                    )
                        throw invalidUpload('Stored object does not match registered metadata');
                    const media = await mediaService.create({
                        type: data.type,
                        originalFilename: data.filename,
                        mimeType: data.mimeType,
                        extension: data.extension,
                        fileSize: data.fileSize,
                        status: 'PROCESSING',
                    });
                    const destinationKey = generateStorageKey({
                        id: media.id,
                        createdAt: file.createdAt,
                        filename: `source.${data.extension}`,
                    });
                    await storage.copyObject({ sourceKey: file.storageKey, destinationKey, sourceEtag: object.etag });
                    await mediaVariantService.create({
                        mediaId: media.id,
                        type: 'ORIGINAL',
                        format: data.format,
                        fileSize: data.fileSize,
                        storageKey: destinationKey,
                    });
                    const linked = await scoped.updateFile(file.id, { mediaId: media.id, error: null });
                    return { file: linked, enqueue: true };
                },
            );
            if (!prepared.enqueue) return completion(prepared.file);
            try {
                await queue.enqueueMediaProcessing({ mediaId: prepared.file.mediaId, uploadFileId });
            } catch {
                throw new UploadError(
                    'UPLOAD_QUEUE_UNAVAILABLE',
                    'Processing job could not be accepted; retry completion',
                    503,
                );
            }
            return withFileLock(uploadFileId, async ({ repository: scoped }) => {
                const current = await scoped.findFile(uploadFileId);
                if (!current) throw uploadNotFound();
                // A fast worker may already have advanced this file. Never regress it.
                const file =
                    current.status === 'UPLOADING'
                        ? await scoped.updateFile(uploadFileId, { status: 'PROCESSING', error: null })
                        : current;
                await refreshSession(scoped, file.uploadSessionId);
                return completion(file);
            });
        },
        async loadSession(sessionId, input) {
            validateUploadId(sessionId);
            const page = validateUploadPage(input);
            const session = await repository.findSession(sessionId);
            if (!session) throw uploadNotFound();
            const files = await repository.listFiles(sessionId, page);
            const hasMore = files.length > page.limit;
            return {
                ...session,
                status: sessionStatus(await repository.fileStatuses(sessionId)),
                files: files.slice(0, page.limit),
                nextCursor: hasMore ? files[page.limit - 1].id : null,
            };
        },
    });
}
