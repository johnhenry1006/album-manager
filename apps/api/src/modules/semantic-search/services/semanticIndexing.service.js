import {
    matchesProfile,
    normalizeVector,
    semanticError,
    validateInput,
    validateProviders,
    validateTags,
} from '../validators/semantic.validator.js';
import { callSemanticProvider } from './semanticProviderCall.service.js';

export function createSemanticIndexingService({ repository, storage, embeddingProvider, tagProvider }) {
    const profile = validateProviders(embeddingProvider, tagProvider);
    const tagRevision = tagProvider?.revision ?? 'none';
    async function index(input) {
        const { mediaId } = validateInput(input, { job: true });
        const source = await repository.loadSource(mediaId);
        if (!source) return { status: 'SKIPPED', mediaId };
        const existing = await repository.getIndex(mediaId, profile);
        if (
            existing?.status === 'READY' &&
            matchesProfile(existing, profile) &&
            existing.sourceChecksum === source.checksum &&
            existing.tagRevision === tagRevision
        )
            return { status: 'UNCHANGED', mediaId };
        const identity = { mediaId, ...profile, sourceChecksum: source.checksum, tagRevision };
        try {
            const bytes = await storage.read({ key: source.storageKey });
            const image = { bytes, mimeType: source.mimeType };
            const vector = normalizeVector(
                await callSemanticProvider((signal) => embeddingProvider.embedImage({ ...image, signal })),
                profile,
            );
            const tags = tagProvider
                ? validateTags(await callSemanticProvider((signal) => tagProvider.tagImage({ ...image, signal })))
                : [];
            const saved = await repository.save({ ...identity, vector, tags, status: 'READY', errorCode: null });
            return { status: saved ? 'READY' : 'SKIPPED', mediaId };
        } catch {
            await repository.fail(identity);
            throw semanticError(503, 'Semantic indexing unavailable');
        }
    }
    return Object.freeze({
        index,
        async reconcile(input) {
            if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)
                throw semanticError(400);
            const ids = await repository.findCandidates({
                ...profile,
                tagRevision,
                limit: 50,
                retryBefore: new Date(Date.now() - 300000),
            });
            let failed = 0;
            for (const mediaId of ids) {
                try {
                    await index({ mediaId });
                } catch {
                    failed++;
                }
            }
            return { processed: ids.length, failed };
        },
    });
}
