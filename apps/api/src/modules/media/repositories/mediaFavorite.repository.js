export function createMediaFavoriteRepository(client, { inTransaction = typeof client.$connect !== 'function' } = {}) {
    const repository = {
        transaction(run) {
            if (inTransaction) return run(repository);
            return client.$transaction((tx) => run(createMediaFavoriteRepository(tx, { inTransaction: true })), {
                isolationLevel: 'ReadCommitted',
            });
        },
        async lockMedia(id) {
            const rows =
                await client.$queryRaw`SELECT id FROM media WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
            return rows[0] ?? null;
        },
        add(mediaId) {
            return client.favorite.createMany({ data: { mediaId }, skipDuplicates: true });
        },
        remove(mediaId) {
            return client.favorite.deleteMany({ where: { mediaId } });
        },
    };
    return Object.freeze(repository);
}
