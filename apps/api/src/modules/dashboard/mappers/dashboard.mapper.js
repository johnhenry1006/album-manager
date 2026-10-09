export function mapDashboard({ data, updatedAt }, albums, media) {
    return {
        counts: {
            media: Number(data.mediaCount),
            albums: Number(data.albumCount),
            categories: Number(data.categoryCount),
            tags: Number(data.tagCount),
            processingMedia: Number(data.processingCount),
            failedMedia: Number(data.failedCount),
        },
        storage: {
            originalBytes: String(data.originalBytes),
            optimizedBytes: String(data.optimizedBytes),
            estimatedSavedBytes: String(data.savedBytes),
        },
        summaryUpdatedAt: updatedAt.toISOString(),
        recentAlbums: albums.map(({ id, name, slug, visibility, createdAt, coverMediaId, coverMedia }) => ({
            id,
            name,
            slug,
            visibility,
            createdAt: createdAt.toISOString(),
            coverMediaId,
            coverMedia,
        })),
        recentMedia: media.map(({ id, type, originalFilename, status, width, height, createdAt, thumbnails }) => ({
            id,
            type,
            originalFilename,
            status,
            width,
            height,
            createdAt: createdAt.toISOString(),
            thumbnails,
        })),
    };
}
