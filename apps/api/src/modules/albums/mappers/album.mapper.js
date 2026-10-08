export function mapAlbum(row, counts) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        visibility: row.visibility,
        coverMediaId: row.coverMedia?.deletedAt ? null : row.coverMediaId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        ...(counts ? { counts } : {}),
    };
}

export function mapAlbumMembership(row) {
    return {
        membershipId: row.id,
        albumId: row.albumId,
        mediaId: row.mediaId,
        position: row.position,
        createdAt: row.createdAt.toISOString(),
    };
}
