import { mapMediaListItem } from '../mappers/mediaList.mapper.js';
import { validateMediaListQuery } from '../validators/mediaList.validator.js';
import { encodeMediaListCursor } from '../validators/mediaListCursor.js';

export function createMediaListService({ repository, storage, config }) {
    return Object.freeze({
        async list(input) {
            const query = validateMediaListQuery(input, config);
            const rows = await repository.findPage(query);
            const hasMore = rows.length > query.limit;
            const records = rows.slice(0, query.limit);
            const items = await Promise.all(
                records.map(async (record) => {
                    const thumbnails = await Promise.all(
                        record.variants.map(async (variant) => {
                            const { url } = await storage.createPresignedDownloadUrl({
                                key: variant.storageKey,
                                expiresIn: config.urlExpirySeconds,
                            });
                            return {
                                name: variant.name,
                                format: variant.format,
                                width: variant.width,
                                height: variant.height,
                                url,
                            };
                        }),
                    );
                    return mapMediaListItem(record, thumbnails);
                }),
            );
            return { items, nextCursor: hasMore ? encodeMediaListCursor(records.at(-1), query) : null, hasMore };
        },
    });
}
