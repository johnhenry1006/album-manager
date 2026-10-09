import { requireActorId } from '#shared/validation/actor.js';

import { mapMediaTrashItem } from '../mappers/mediaTrash.mapper.js';
import { encodeMediaListCursor } from '../validators/mediaListCursor.js';
import {
    TRASH_ORDER,
    validateCleanupMedia,
    validateRetentionCleanup,
    validateTrashMutation,
    validateTrashQuery,
} from '../validators/mediaTrash.validator.js';
import { MediaDomainError, notFound } from './media.errors.js';
import { createMediaGalleryItem } from './mediaGallery.service.js';

function conflict(message) {
    return new MediaDomainError('TRASH_CONFLICT', message, 409);
}

export function createMediaTrashService({ repository, storageDeletion, storage, config = {}, now = () => new Date() }) {
    function assertPurgeAvailable() {
        if (!repository.durableTransactions) throw conflict('Permanent deletion requires an owned database client');
        storageDeletion.assertAvailable();
    }
    async function purge(mediaId, before) {
        assertPurgeAvailable();
        const variants = await repository.transaction(async (tx) => {
            const record = await tx.lockMedia(mediaId);
            if (before && (!record?.deletedAt || record.deletedAt > before)) return null;
            if (!record) throw notFound();
            if (!record.deletedAt) throw conflict('Move media to trash before permanently deleting it');
            if (!record.purgeStartedAt) await tx.update(mediaId, { purgeStartedAt: now() });
            return tx.variantKeys(mediaId);
        });
        if (variants === null) return false;
        // The marker is committed. Storage errors leave rows and keys intact for retry.
        await storageDeletion.deleteVariants(variants, mediaId);
        await repository.transaction(async (tx) => {
            const record = await tx.lockMedia(mediaId);
            if (!record) return; // Another idempotent purge finished first.
            if (!record.deletedAt || !record.purgeStartedAt) throw conflict('Media is no longer purging');
            await tx.finalize(mediaId);
        });
        return true;
    }
    return Object.freeze({
        async softDelete(id, query, body) {
            const mediaId = validateTrashMutation(id, query, body);
            await repository.transaction(async (tx) => {
                const record = await tx.lockMedia(mediaId);
                if (!record) throw notFound();
                if (!record.deletedAt) await tx.update(mediaId, { deletedAt: now() });
            });
        },
        async restore(id, query, body) {
            const mediaId = validateTrashMutation(id, query, body);
            await repository.transaction(async (tx) => {
                const record = await tx.lockMedia(mediaId);
                if (!record) throw notFound();
                if (record.purgeStartedAt) throw conflict('Permanent deletion has already started');
                if (record.deletedAt) await tx.update(mediaId, { deletedAt: null });
            });
        },
        async list(input, actor) {
            const query = validateTrashQuery(input, config);
            const rows = await repository.findPage(query, requireActorId(actor));
            const hasMore = rows.length > query.limit;
            const page = rows.slice(0, query.limit);
            const items = await Promise.all(
                page.map(async (row) => {
                    const gallery = await createMediaGalleryItem(
                        { ...row, variants: row.purgeStartedAt || !storage ? [] : row.variants },
                        { storage, urlExpirySeconds: config.urlExpirySeconds ?? 900 },
                    );
                    return mapMediaTrashItem(row, gallery);
                }),
            );
            return { items, hasMore, nextCursor: hasMore ? encodeMediaListCursor(page.at(-1), TRASH_ORDER) : null };
        },
        async permanent(id, body, query) {
            const mediaId = validateTrashMutation(id, query, body, { permanent: true });
            await purge(mediaId);
        },
        async cleanupMedia(id, before) {
            validateCleanupMedia(id, before, now());
            return purge(id, before);
        },
        async cleanupExpired(input) {
            const options = validateRetentionCleanup(input, now());
            assertPurgeAvailable();
            const candidates = await repository.expired(options);
            const result = { deleted: [], skipped: [], failed: [] };
            for (const { id } of candidates) {
                try {
                    result[(await purge(id, options.before)) ? 'deleted' : 'skipped'].push(id);
                } catch {
                    result.failed.push(id);
                }
            }
            return result;
        },
    });
}
