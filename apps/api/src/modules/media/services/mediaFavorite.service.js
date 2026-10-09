import { requireActorId } from '#shared/validation/actor.js';

import { validateMediaFavoriteRequest } from '../validators/mediaFavorite.validator.js';
import { notFound } from './media.errors.js';

export function createMediaFavoriteService({ repository }) {
    async function mutate(operation, id, query, body, actor) {
        const userId = requireActorId(actor);
        const mediaId = validateMediaFavoriteRequest(id, query, body);
        await repository.transaction(async (tx) => {
            // Serialize mutations and soft deletion on the same live media row.
            if (!(await tx.lockMedia(mediaId))) throw notFound();
            await tx[operation](mediaId, userId);
        });
    }
    return Object.freeze({
        add: (id, query, body, actor) => mutate('add', id, query, body, actor),
        remove: (id, query, body, actor) => mutate('remove', id, query, body, actor),
    });
}
