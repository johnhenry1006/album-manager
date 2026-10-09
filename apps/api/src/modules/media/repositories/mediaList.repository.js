import { buildMediaListQuery } from './mediaList.query.js';

export function createMediaListRepository(client) {
    return Object.freeze({
        findPage(query, userId) {
            return client.media.findMany(buildMediaListQuery(query, userId));
        },
    });
}
