import { validateMediaFavoriteRequest } from '../validators/mediaFavorite.validator.js';
import { notFound } from './media.errors.js';

export function createMediaFavoriteService({ repository }) {
    async function mutate(operation, id, query, body) {
        const mediaId = validateMediaFavoriteRequest(id, query, body);
        await repository.transaction(async (tx) => {
            // Serialize mutations and soft deletion on the same live media row.
            if (!(await tx.lockMedia(mediaId))) throw notFound();
            await tx[operation](mediaId);
        });
    }
    return Object.freeze({
        add: (id, query, body) => mutate('add', id, query, body),
        remove: (id, query, body) => mutate('remove', id, query, body),
    });
}
