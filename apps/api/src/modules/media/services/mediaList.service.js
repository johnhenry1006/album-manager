import { validateMediaListQuery } from '../validators/mediaList.validator.js';
import { encodeMediaListCursor } from '../validators/mediaListCursor.js';
import { createMediaGalleryItem } from './mediaGallery.service.js';

export function createMediaListService({ repository, storage, config }) {
    return Object.freeze({
        async list(input) {
            const query = validateMediaListQuery(input, config);
            const rows = await repository.findPage(query);
            const hasMore = rows.length > query.limit;
            const records = rows.slice(0, query.limit);
            const items = await Promise.all(
                records.map((record) =>
                    createMediaGalleryItem(record, { storage, urlExpirySeconds: config.urlExpirySeconds }),
                ),
            );
            return { items, nextCursor: hasMore ? encodeMediaListCursor(records.at(-1), query) : null, hasMore };
        },
    });
}
