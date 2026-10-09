import { requireActorId } from '#shared/validation/actor.js';

import { validateMediaListQuery } from '../validators/mediaList.validator.js';
import { encodeMediaListCursor } from '../validators/mediaListCursor.js';
import { createMediaGalleryItem } from './mediaGallery.service.js';

export function createMediaListService({ repository, storage, config }) {
    return Object.freeze({
        async list(input, actor) {
            const query = validateMediaListQuery(input, config);
            const rows = await repository.findPage(query, requireActorId(actor));
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
