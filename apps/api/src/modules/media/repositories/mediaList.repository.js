import { buildMediaListQuery } from './mediaList.query.js';

export function createMediaListRepository(client) {
    return Object.freeze({
        findPage(query) {
            return client.media.findMany(buildMediaListQuery(query));
        },
    });
}
