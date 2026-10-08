export function mapMediaListItem(record, thumbnails) {
    return {
        id: record.id,
        type: record.type,
        originalFilename: record.originalFilename,
        width: record.width,
        height: record.height,
        aspectRatio: record.aspectRatio,
        favorite: record.favorite !== null,
        takenAt: record.takenAt?.toISOString() ?? null,
        thumbnails,
    };
}
