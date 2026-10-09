import { expect, it } from 'vitest';

import { createMediaFavoriteService } from '../services/mediaFavorite.service.js';
import { buildMediaListQuery } from './mediaList.query.js';
const id = 'a0000000-0000-4000-8000-000000000001';
const actor = { id: '00000000-0000-4000-8000-000000000001' };
it('scopes positive and negative favorites to the actor', () => {
    const input = { limit: 50, sort: 'createdAt', order: 'desc' };
    expect(buildMediaListQuery({ ...input, favorite: true }, actor.id).where.favorites).toEqual({
        some: { userId: actor.id },
    });
    expect(buildMediaListQuery({ ...input, favorite: false }, actor.id).where.favorites).toEqual({
        none: { userId: actor.id },
    });
    expect(buildMediaListQuery(input, actor.id).select.favorites.where).toEqual({ userId: actor.id });
});
it('rejects actor-free favorite mutations before persistence', async () => {
    const service = createMediaFavoriteService({ repository: {} });
    await expect(service.add(id)).rejects.toMatchObject({ statusCode: 401 });
});
