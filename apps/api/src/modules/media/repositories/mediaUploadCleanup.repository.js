// Called within the upload file transaction, after session/file locks.
export function createMediaUploadCleanupRepository(client) {
    return Object.freeze({
        findOriginal(mediaId) {
            return client.mediaVariant.findFirst({
                where: { mediaId, type: 'ORIGINAL', media: { deletedAt: null } },
            });
        },
        async loadCandidate(mediaId, uploadFileId) {
            await client.$queryRaw`SELECT id FROM media WHERE id = ${mediaId}::uuid FOR UPDATE`;
            return client.media.findFirst({
                where: {
                    id: mediaId,
                    deletedAt: null,
                    status: 'PENDING',
                    albums: { none: {} },
                    coverForAlbums: { none: {} },
                    categories: { none: {} },
                    tags: { none: {} },
                    favorite: { is: null },
                    metadata: { is: null },
                    duplicateFiles: { none: {} },
                    uploadFiles: { none: { id: { not: uploadFileId } } },
                },
                include: { variants: true },
            });
        },
        async keyIsReferenced(key, uploadFileId) {
            return Boolean(
                (await client.mediaVariant.findUnique({ where: { storageKey: key }, select: { id: true } })) ||
                (await client.uploadFile.findFirst({
                    where: { storageKey: key, id: { not: uploadFileId } },
                    select: { id: true },
                })),
            );
        },
        async originalHasUploadAlias(key, uploadFileId) {
            return Boolean(
                await client.uploadFile.findFirst({
                    where: { storageKey: key, id: { not: uploadFileId } },
                    select: { id: true },
                }),
            );
        },
        retire(mediaId) {
            return client.media.update({ where: { id: mediaId }, data: { deletedAt: new Date() } });
        },
    });
}
