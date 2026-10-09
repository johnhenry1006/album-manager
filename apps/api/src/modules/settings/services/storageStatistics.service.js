import { mapStorageProviderMetadata } from '#infrastructure/storage/index.js';

export function createStorageStatisticsService({ repository, storage }) {
    return Object.freeze({
        async getStatistics() {
            const [totals, metadata] = await Promise.all([
                repository.readAggregates(),
                storage?.getProviderMetadata?.(),
            ]);
            const originalBytes = BigInt(totals.originalBytes);
            const variantBytes = BigInt(totals.variantBytes);
            const objectCount = Number(totals.objectCount);
            return {
                ...mapStorageProviderMetadata(metadata),
                objectCount: Number.isSafeInteger(objectCount) ? objectCount : null,
                originalBytes: String(originalBytes),
                optimizedBytes: String(totals.optimizedBytes),
                variantBytes: String(variantBytes),
                totalBytes: String(originalBytes + variantBytes),
                estimatedSavedBytes: String(totals.estimatedSavedBytes),
            };
        },
    });
}
