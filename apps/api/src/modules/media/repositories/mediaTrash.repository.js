const LIFECYCLE_SELECT = { id: true, deletedAt: true, purgeStartedAt: true };
const TRASH_SELECT = {
    ...LIFECYCLE_SELECT,
    type: true,
    originalFilename: true,
    width: true,
    height: true,
    aspectRatio: true,
    takenAt: true,
    variants: {
        where: { type: 'THUMBNAIL' },
        orderBy: [{ width: 'asc' }, { id: 'asc' }],
        select: { name: true, format: true, width: true, height: true, storageKey: true },
    },
};

export function createMediaTrashRepository(client, { inTransaction = typeof client.$connect !== 'function' } = {}) {
    const repository = {
        durableTransactions: !inTransaction,
        transaction(run) {
            if (inTransaction) return run(repository);
            return client.$transaction((tx) => run(createMediaTrashRepository(tx, { inTransaction: true })), {
                isolationLevel: 'ReadCommitted',
            });
        },
        async lockMedia(id) {
            await client.$queryRaw`SELECT id FROM media WHERE id = ${id}::uuid FOR UPDATE`;
            return client.media.findUnique({ where: { id }, select: LIFECYCLE_SELECT });
        },
        update(id, data) {
            return client.media.update({ where: { id }, data, select: LIFECYCLE_SELECT });
        },
        variantKeys(mediaId) {
            return client.mediaVariant.findMany({
                where: { mediaId },
                orderBy: { storageKey: 'asc' },
                select: { storageKey: true },
            });
        },
        async finalize(id) {
            await client.mediaVariant.deleteMany({ where: { mediaId: id } });
            await client.media.delete({ where: { id } });
        },
        findPage({ limit, cursor }, userId) {
            return client.media.findMany({
                where: {
                    deletedAt: { not: null },
                    ...(cursor
                        ? {
                              OR: [
                                  { deletedAt: { lt: cursor.value } },
                                  { deletedAt: cursor.value, id: { lt: cursor.id } },
                              ],
                          }
                        : {}),
                },
                select: { ...TRASH_SELECT, favorites: { where: { userId }, take: 1, select: { id: true } } },
                orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
                take: limit + 1,
            });
        },
        expired({ before, limit, after }) {
            return client.media.findMany({
                where: {
                    deletedAt: { lte: before },
                    ...(after
                        ? {
                              OR: [
                                  { deletedAt: { gt: after.deletedAt } },
                                  { deletedAt: after.deletedAt, id: { gt: after.id } },
                              ],
                          }
                        : {}),
                },
                select: { id: true, deletedAt: true },
                orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
                take: limit,
            });
        },
    };
    return Object.freeze(repository);
}
