import { mapMedia } from './media.mapper.js';

export function mapMediaDisplayVariant(variant, signedUrl) {
    return {
        id: variant.id,
        type: variant.type,
        name: variant.name,
        format: variant.format,
        width: variant.width,
        height: variant.height,
        fileSize: variant.fileSize.toString(),
        quality: variant.quality,
        url: signedUrl.url,
        expiresIn: signedUrl.expiresIn,
        expiresAt: signedUrl.expiresAt,
    };
}

export function mapMediaDetail(record, variants) {
    const core = mapMedia(record);
    delete core.deletedAt;
    return {
        ...core,
        fileSize: record.fileSize.toString(),
        takenAt: record.takenAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        favorite: record.favorite !== null,
        albums: record.albums.map(({ album, position, createdAt }) => ({
            id: album.id,
            name: album.name,
            slug: album.slug,
            description: album.description,
            visibility: album.visibility,
            position,
            addedAt: createdAt.toISOString(),
        })),
        categories: record.categories.map(({ category }) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            parentId: category.parentId,
        })),
        tags: record.tags.map(({ tag }) => ({ id: tag.id, name: tag.name, slug: tag.slug })),
        metadata:
            record.metadata === null
                ? null
                : Object.fromEntries(
                      [
                          'cameraMake',
                          'cameraModel',
                          'lens',
                          'focalLength',
                          'aperture',
                          'iso',
                          'shutterSpeed',
                          'latitude',
                          'longitude',
                          'rawMetadata',
                      ].map((field) => [field, record.metadata[field]]),
                  ),
        variants,
    };
}
