import { invalid, MediaDomainError } from './media.errors.js';

// Queue delivery is at least once. Purges use the existing durable marker/manifest.
export function createMediaCleanupService({ repository, trashService, retentionDays, logger, now = () => new Date() }) {
    if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 36500)
        throw invalid('Invalid trash retention');
    return Object.freeze({
        async process(data) {
            // Retention policy belongs to validated server config, never to a queued payload.
            if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length)
                throw invalid('Invalid media cleanup job');
            const before = new Date(now().getTime() - retentionDays * 86400000);
            const result = { deleted: 0, skipped: 0 };
            let failed = 0;
            let after;
            for (;;) {
                const candidates = await repository.expired({ before, limit: 50, after });
                if (!candidates.length) break;
                for (const { id } of candidates) {
                    try {
                        result[(await trashService.cleanupMedia(id, before)) ? 'deleted' : 'skipped']++;
                    } catch {
                        failed++;
                        logger?.error({ mediaId: id, code: 'MEDIA_CLEANUP_FAILED' }, 'Media cleanup failed');
                    }
                }
                // Advance even past failures; one broken manifest must not starve the library.
                const last = candidates.at(-1);
                after = { id: last.id, deletedAt: last.deletedAt };
            }
            if (failed)
                throw new MediaDomainError('MEDIA_CLEANUP_FAILED', `${failed} media cleanup operations failed`, 500);
            return result;
        },
    });
}
