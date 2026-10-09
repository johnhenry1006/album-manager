export function createTaxonomyAssignmentRepository(client, kind) {
    const categories = kind === 'categories';
    const model = categories ? client.mediaCategory : client.mediaTag;
    const entity = categories ? client.category : client.tag;
    const field = categories ? 'categoryId' : 'tagId';
    return {
        async lockMedia(ids) {
            // The validated batch is bounded to 100 IDs. Sort in SQL so overlapping
            // batches acquire locks in the same order without one round trip per ID.
            const rows = await client.$queryRaw`
                SELECT id FROM media
                WHERE id = ANY(${ids}::uuid[]) AND deleted_at IS NULL
                ORDER BY id FOR UPDATE
            `;
            return rows.map((row) => row.id);
        },
        async findEntityIds(ids) {
            const rows = await entity.findMany({ where: { id: { in: ids } }, select: { id: true } });
            return rows.map((row) => row.id);
        },
        assign(mediaIds, entityIds) {
            return model.createMany({
                data: mediaIds.flatMap((mediaId) => entityIds.map((id) => ({ mediaId, [field]: id }))),
                skipDuplicates: true,
            });
        },
    };
}
