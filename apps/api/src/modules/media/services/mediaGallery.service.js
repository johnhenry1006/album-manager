import { mapMediaListItem } from '../mappers/mediaList.mapper.js';

// Shared compact gallery contract for media and album membership lists.
export async function createMediaGalleryItem(record, { storage, urlExpirySeconds }) {
    const thumbnails = await Promise.all(
        record.variants.map(async (variant) => {
            const { url } = await storage.createPresignedDownloadUrl({
                key: variant.storageKey,
                expiresIn: urlExpirySeconds,
            });
            return { name: variant.name, format: variant.format, width: variant.width, height: variant.height, url };
        }),
    );
    return mapMediaListItem(record, thumbnails);
}
