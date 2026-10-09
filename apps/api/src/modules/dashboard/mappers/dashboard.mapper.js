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
        recentAlbums: albums.map(({ id, name, slug, visibility, createdAt }) => ({
            id,
            name,
            slug,
            visibility,
            createdAt: createdAt.toISOString(),
        })),
        recentMedia: media.map(({ id, type, originalFilename, status, width, height, createdAt }) => ({
            id,
            type,
            originalFilename,
            status,
            width,
            height,
            createdAt: createdAt.toISOString(),
        })),
    };
}
