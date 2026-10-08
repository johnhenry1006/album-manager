import { DISPLAY_VARIANT_FORMATS, DISPLAY_VARIANT_TYPES } from '../validators/mediaDetail.validator.js';

export function createMediaDetailRepository(client) {
    return Object.freeze({
        findDetail(id) {
            return client.media.findUnique({
                where: { id, deletedAt: null },
                select: {
                    id: true,
                    type: true,
                    originalFilename: true,
                    mimeType: true,
                    extension: true,
                    fileSize: true,
                    width: true,
                    height: true,
                    aspectRatio: true,
                    checksum: true,
                    status: true,
                    takenAt: true,
                    createdAt: true,
                    updatedAt: true,
                    favorite: { select: { id: true } },
                    albums: {
                        where: { album: { deletedAt: null } },
                        orderBy: { albumId: 'asc' },
                        select: {
                            position: true,
                            createdAt: true,
                            album: {
                                select: { id: true, name: true, slug: true, description: true, visibility: true },
                            },
                        },
                    },
                    categories: {
                        orderBy: { categoryId: 'asc' },
                        select: { category: { select: { id: true, name: true, slug: true, parentId: true } } },
                    },
                    tags: {
                        orderBy: { tagId: 'asc' },
                        select: { tag: { select: { id: true, name: true, slug: true } } },
                    },
                    metadata: {
                        select: {
                            cameraMake: true,
                            cameraModel: true,
                            lens: true,
                            focalLength: true,
                            aperture: true,
                            iso: true,
                            shutterSpeed: true,
                            latitude: true,
                            longitude: true,
                            rawMetadata: true,
                        },
                    },
                    variants: {
                        where: { type: { in: DISPLAY_VARIANT_TYPES }, format: { in: DISPLAY_VARIANT_FORMATS } },
                        orderBy: [{ type: 'asc' }, { width: 'asc' }, { id: 'asc' }],
                        select: {
                            id: true,
                            type: true,
                            name: true,
                            format: true,
                            width: true,
                            height: true,
                            fileSize: true,
                            quality: true,
                            storageKey: true,
                        },
                    },
                },
            });
        },
        findOriginal(id) {
            return client.media.findUnique({
                where: { id, deletedAt: null },
                select: {
                    id: true,
                    variants: {
                        where: { type: 'ORIGINAL' },
                        take: 1,
                        orderBy: { id: 'asc' },
                        select: { storageKey: true },
                    },
                },
            });
        },
    });
}
