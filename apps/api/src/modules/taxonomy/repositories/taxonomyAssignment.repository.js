export function createTaxonomyAssignmentRepository(client, kind) {
    const categories = kind === 'categories';
    const model = categories ? client.mediaCategory : client.mediaTag;
    const field = categories ? 'categoryId' : 'tagId';
    return {
        async lockMedia(ids) {
            const liveIds = [];
            for (const id of ids) {
                const rows =
                    await client.$queryRaw`SELECT id FROM media WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
                if (rows.length) liveIds.push(rows[0].id);
            }
            return liveIds;
        },
        assign(mediaIds, entityIds) {
            return model.createMany({
                data: mediaIds.flatMap((mediaId) => entityIds.map((id) => ({ mediaId, [field]: id }))),
                skipDuplicates: true,
            });
        },
    };
}
