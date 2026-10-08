import { validateKey } from '#infrastructure/storage/storageValidation.js';

import { MediaDomainError } from './media.errors.js';

// Only recorded variant keys are deleted. Storage missing-object deletion is idempotent.
export function createMediaStorageDeletionService({ storage }) {
    function assertAvailable() {
        if (typeof storage?.delete !== 'function')
            throw new MediaDomainError('STORAGE_UNAVAILABLE', 'Storage deletion is unavailable', 503);
    }
    return Object.freeze({
        assertAvailable,
        async deleteVariants(variants) {
            assertAvailable();
            // Validate the complete manifest before the first irreversible operation.
            const keys = [...new Set(variants.map(({ storageKey }) => validateKey(storageKey)))];
            for (const key of keys) await storage.delete({ key });
        },
    });
}
