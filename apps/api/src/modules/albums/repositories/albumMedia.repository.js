const MEDIA_SELECT = {
    id: true,
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

export function createAlbumMediaRepository(client) {
    return {
        async lockMedia(id) {
            const rows =
                await client.$queryRaw`SELECT id FROM media WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
            return rows[0] ?? null;
        },
        findMembership(albumId, mediaId) {
            return client.albumMedia.findUnique({ where: { albumId_mediaId: { albumId, mediaId } } });
        },
        async maxPosition(albumId) {
            const result = await client.albumMedia.aggregate({ where: { albumId }, _max: { position: true } });
            return result._max.position ?? -1;
        },
        assignMembership(albumId, mediaId, position) {
            return client.albumMedia.upsert({
                where: { albumId_mediaId: { albumId, mediaId } },
                create: { albumId, mediaId, position },
                update: { position },
            });
        },
        removeMembership(albumId, mediaId) {
            return client.albumMedia.delete({ where: { albumId_mediaId: { albumId, mediaId } } });
        },
        findMediaPage(albumId, { limit, cursor, q, type, favorite }, userId) {
            return client.albumMedia.findMany({
                where: {
                    albumId,
                    media: {
                        deletedAt: null,
                        ...(type ? { type } : {}),
                        ...(favorite === undefined
                            ? {}
                            : { favorites: favorite ? { some: { userId } } : { none: { userId } } }),
                        ...(q === undefined
                            ? {}
                            : { originalFilename: { contains: q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } }),
                    },
                    ...(cursor
                        ? {
                              OR: [
                                  { position: { gt: cursor.position } },
                                  { position: cursor.position, id: { gt: cursor.id } },
                              ],
                          }
                        : {}),
                },
                orderBy: [{ position: 'asc' }, { id: 'asc' }],
                take: limit + 1,
                select: {
                    id: true,
                    position: true,
                    media: {
                        select: { ...MEDIA_SELECT, favorites: { where: { userId }, take: 1, select: { id: true } } },
                    },
                },
            });
        },
    };
}
