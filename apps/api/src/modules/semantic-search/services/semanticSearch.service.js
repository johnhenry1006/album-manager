import { createHash } from 'node:crypto';

import {
    matchesProfile,
    normalizeVector,
    semanticError,
    validateInput,
    validateMediaId,
    validateProviders,
} from '../validators/semantic.validator.js';
import { callSemanticProvider } from './semanticProviderCall.service.js';

export function createSemanticSearchService({ repository, vectorIndex = repository, embeddingProvider }) {
    const profile = validateProviders(embeddingProvider);
    async function load(mediaId) {
        const source = await repository.loadSource(validateMediaId(mediaId));
        if (!source) throw semanticError(404);
        const record = await repository.getIndex(source.id, profile);
        if (
            !record ||
            record.status !== 'READY' ||
            record.sourceChecksum !== source.checksum ||
            !matchesProfile(record, profile)
        )
            throw semanticError(409, 'Media is not indexed in this embedding space');
        return record;
    }
    async function search(vector, query, context, excludeId = null) {
        const fingerprint = createHash('sha256').update(JSON.stringify({ profile, vector, context })).digest('hex');
        let cursor = null;
        if (query.cursor) {
            try {
                cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
                if (
                    cursor.v !== 1 ||
                    cursor.fingerprint !== fingerprint ||
                    !Number.isFinite(cursor.score) ||
                    Math.abs(cursor.score) > 1.000001
                )
                    throw new Error('Invalid cursor');
                validateMediaId(cursor.id);
            } catch {
                throw semanticError(400, 'Invalid semantic cursor');
            }
        }
        const rows = await vectorIndex.search({ profile, vector, excludeId, limit: query.limit + 1, cursor });
        const items = rows.slice(0, query.limit).map(({ id, score }) => ({ id, score }));
        const last = items.at(-1);
        const nextCursor =
            rows.length > query.limit && last
                ? Buffer.from(JSON.stringify({ v: 1, fingerprint, ...last })).toString('base64url')
                : null;
        return { items, nextCursor };
    }
    return Object.freeze({
        async text(input) {
            const query = validateInput(input, { text: true });
            let vector;
            try {
                vector = normalizeVector(
                    await callSemanticProvider((signal) => embeddingProvider.embedText(query.text, { signal })),
                    profile,
                );
            } catch {
                throw semanticError(503, 'Semantic search unavailable');
            }
            return search(vector, query, { text: query.text });
        },
        async similar(mediaId, input) {
            const query = validateInput(input);
            const record = await load(mediaId);
            return search(
                normalizeVector(record.vector, profile),
                query,
                { mediaId: record.mediaId, checksum: record.sourceChecksum },
                record.mediaId,
            );
        },
        async tags(mediaId) {
            const record = await load(mediaId);
            return {
                mediaId: record.mediaId,
                tags: record.tags,
                space: record.space,
                model: record.model,
                tagRevision: record.tagRevision,
            };
        },
    });
}
