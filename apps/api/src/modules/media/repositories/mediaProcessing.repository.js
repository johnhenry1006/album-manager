import { invalid, notFound } from '../services/media.errors.js';
import { validateMedia } from '../validators/media.validator.js';

// This repository owns atomic job state across Media, UploadFile and extracted
// metadata. Transformations and object storage never run inside these transactions.
export function createMediaProcessingRepository(client) {
    async function locked(mediaId, uploadFileId, run) {
        return client.$transaction(async (transaction) => {
            const file = await transaction.uploadFile.findUnique({ where: { id: uploadFileId } });
            if (!file || file.mediaId !== mediaId || file.status === 'CANCELLED')
                throw invalid('Upload is no longer processable');
            // Match upload completion lock order: session, file, then media.
            if (file.uploadSessionId)
                await transaction.$queryRaw`SELECT id FROM upload_sessions WHERE id = ${file.uploadSessionId}::uuid FOR UPDATE`;
            await transaction.$queryRaw`SELECT id FROM upload_files WHERE id = ${uploadFileId}::uuid FOR UPDATE`;
            const currentFile = await transaction.uploadFile.findUnique({ where: { id: uploadFileId } });
            if (!currentFile || currentFile.mediaId !== mediaId || currentFile.status === 'CANCELLED')
                throw invalid('Upload is no longer processable');
            await transaction.$queryRaw`SELECT id FROM media WHERE id = ${mediaId}::uuid AND deleted_at IS NULL FOR UPDATE`;
            const media = await transaction.media.findUnique({ where: { id: mediaId, deletedAt: null } });
            if (!media) throw notFound();
            return run(transaction, media);
        });
    }
    return Object.freeze({
        loadUploadFile(id) {
            return client.uploadFile.findUnique({ where: { id } });
        },
        findOriginal(mediaId) {
            return client.mediaVariant.findFirst({ where: { mediaId, type: 'ORIGINAL', media: { deletedAt: null } } });
        },
        async loadAdmission(mediaId, uploadFileId) {
            await client.$queryRaw`SELECT id FROM upload_files WHERE id = ${uploadFileId}::uuid FOR UPDATE`;
            const file = await client.uploadFile.findUnique({ where: { id: uploadFileId } });
            if (!file || file.mediaId !== mediaId || file.status === 'CANCELLED')
                throw invalid('Upload is no longer processable');
            return Boolean(file.processingAcceptedAt);
        },
        acceptProcessing(uploadFileId) {
            return client.uploadFile.update({
                where: { id: uploadFileId },
                data: { processingAcceptedAt: new Date() },
            });
        },
        withChecksumLock(checksum, run) {
            return client.$transaction(async (transaction) => {
                await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${checksum}, 0))::text`;
                return run(transaction);
            });
        },
        start(mediaId, uploadFileId) {
            return locked(mediaId, uploadFileId, async (transaction, media) => {
                if (media.status === 'READY') return false;
                await transaction.media.update({
                    where: { id: mediaId, deletedAt: null },
                    data: { status: 'PROCESSING' },
                });
                await transaction.uploadFile.update({
                    where: { id: uploadFileId },
                    data: { status: 'PROCESSING', error: null },
                });
                return true;
            });
        },
        markDuplicate(mediaId, uploadFileId, duplicateOfMediaId) {
            return locked(mediaId, uploadFileId, async (transaction, media) => {
                if (media.status === 'READY') return;
                await transaction.media.update({
                    where: { id: mediaId, deletedAt: null },
                    data: { status: 'PENDING' },
                });
                await transaction.uploadFile.update({
                    where: { id: uploadFileId },
                    data: { status: 'DUPLICATE_PENDING', duplicateOfMediaId, error: null },
                });
            });
        },
        finish(mediaId, uploadFileId, patch, metadata) {
            const data = validateMedia({ ...patch, status: 'READY' });
            return locked(mediaId, uploadFileId, async (transaction) => {
                await transaction.mediaMetadata.upsert({
                    where: { mediaId },
                    create: { mediaId, ...metadata },
                    update: metadata,
                });
                await transaction.media.update({ where: { id: mediaId, deletedAt: null }, data });
                await transaction.uploadFile.update({
                    where: { id: uploadFileId },
                    data: { status: 'READY', error: null, duplicateOfMediaId: null },
                });
            });
        },
        repairReadyUpload(mediaId, uploadFileId) {
            return locked(mediaId, uploadFileId, async (transaction, media) => {
                if (media.status !== 'READY') throw invalid('Media is no longer ready');
                await transaction.uploadFile.update({
                    where: { id: uploadFileId },
                    data: { status: 'READY', error: null, duplicateOfMediaId: null },
                });
            });
        },
        fail(mediaId, uploadFileId) {
            return locked(mediaId, uploadFileId, async (transaction, media) => {
                if (media.status === 'READY') return;
                await transaction.media.update({ where: { id: mediaId, deletedAt: null }, data: { status: 'FAILED' } });
                await transaction.uploadFile.update({
                    where: { id: uploadFileId },
                    data: { status: 'FAILED', error: 'Media processing failed' },
                });
            });
        },
    });
}
