// All AI persistence and live-media checks remain in this repository. No storage writes.
export function createSemanticRepository(client, { inTransaction = false } = {}) {
    const live = { type: 'IMAGE', status: 'READY', deletedAt: null, purgeStartedAt: null, checksum: { not: null } };
    async function publish(record) {
        const run = async (tx) => {
            await tx.$queryRaw`SELECT id FROM media WHERE id = ${record.mediaId}::uuid FOR UPDATE`;
            const source = await tx.media.findFirst({
                where: { id: record.mediaId, ...live, checksum: record.sourceChecksum },
                select: { id: true },
            });
            if (!source) return false;
            if (record.status === 'FAILED') {
                const existing = await tx.semanticIndex.findUnique({
                    where: { mediaId_space: { mediaId: record.mediaId, space: record.space } },
                });
                if (
                    existing?.status === 'READY' &&
                    existing.sourceChecksum === record.sourceChecksum &&
                    existing.model === record.model &&
                    existing.dimensions === record.dimensions &&
                    existing.tagRevision === record.tagRevision
                )
                    return true;
            }
            const { mediaId, space, ...data } = record;
            await tx.semanticIndex.upsert({
                where: { mediaId_space: { mediaId, space } },
                create: record,
                update: data,
            });
            return true;
        };
        return inTransaction ? run(client) : client.$transaction(run);
    }
    return Object.freeze({
        async loadSource(mediaId) {
            const media = await client.media.findFirst({
                where: { id: mediaId, ...live },
                select: {
                    id: true,
                    checksum: true,
                    mimeType: true,
                    variants: { where: { type: 'ORIGINAL' }, take: 1, select: { storageKey: true } },
                },
            });
            if (!media?.variants.length) return null;
            return {
                id: media.id,
                checksum: media.checksum,
                mimeType: media.mimeType,
                storageKey: media.variants[0].storageKey,
            };
        },
        getIndex(mediaId, profile) {
            return client.semanticIndex.findUnique({ where: { mediaId_space: { mediaId, space: profile.space } } });
        },
        save: publish,
        fail(identity) {
            return publish({ ...identity, status: 'FAILED', vector: [], tags: [], errorCode: 'SEMANTIC_INDEX_FAILED' });
        },
        async findCandidates({ space, model, dimensions, tagRevision, limit, retryBefore }) {
            const rows = await client.$queryRaw`
                SELECT m.id FROM media m
                LEFT JOIN semantic_indexes s ON s.media_id = m.id AND s.space = ${space}
                WHERE m.type = 'IMAGE' AND m.status = 'READY' AND m.deleted_at IS NULL
                  AND m.purge_started_at IS NULL AND m.checksum IS NOT NULL
                  AND EXISTS (SELECT 1 FROM media_variants v WHERE v.media_id = m.id AND v.type = 'ORIGINAL')
                  AND (s.media_id IS NULL OR
                    ((s.status <> 'FAILED' OR s.updated_at < ${retryBefore}) AND
                     (s.status = 'FAILED' OR s.source_checksum <> m.checksum OR s.model <> ${model}
                      OR s.dimensions <> ${dimensions} OR s.tag_revision <> ${tagRevision})))
                ORDER BY CASE WHEN s.status = 'FAILED' THEN 1 ELSE 0 END ASC,
                  s.updated_at ASC NULLS FIRST, m.id ASC LIMIT ${limit}`;
            return rows.map(({ id }) => id);
        },
        // Vector-index port: normalized dot product is exact cosine similarity.
        // Replace this adapter with an ANN implementation when library size warrants it.
        search({ profile, vector, excludeId = null, limit, cursor = null }) {
            const vectorJson = JSON.stringify(vector);
            return client.$queryRaw`
                WITH query_vector AS (
                    SELECT value::double precision AS value, ordinal
                    FROM jsonb_array_elements_text(${vectorJson}::jsonb) WITH ORDINALITY AS q(value, ordinal)
                ), ranked AS (
                    SELECT s.media_id AS id,
                        (SELECT SUM(v.value * q.value) FROM unnest(s.vector) WITH ORDINALITY AS v(value, ordinal)
                         JOIN query_vector q USING (ordinal)) AS score
                    FROM semantic_indexes s JOIN media m ON m.id = s.media_id
                    WHERE s.space = ${profile.space} AND s.model = ${profile.model} AND s.dimensions = ${profile.dimensions}
                      AND s.status = 'READY' AND s.source_checksum = m.checksum
                      AND m.type = 'IMAGE' AND m.status = 'READY' AND m.deleted_at IS NULL AND m.purge_started_at IS NULL
                      AND (${excludeId}::uuid IS NULL OR m.id <> ${excludeId}::uuid)
                )
                SELECT id, score FROM ranked
                WHERE (${cursor?.score ?? null}::double precision IS NULL OR score < ${cursor?.score ?? null}::double precision
                    OR (score = ${cursor?.score ?? null}::double precision AND id > ${cursor?.id ?? null}::uuid))
                ORDER BY score DESC, id ASC LIMIT ${limit}`;
        },
    });
}
