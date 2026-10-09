import { expect, it, vi } from 'vitest';

import { buildApp } from '../../../app/authenticatedApp.testUtils.js';
import { createAlbumService } from '../services/album.service.js';
import { createAlbumRepository } from './album.repository.js';

it('caps requested album pages to the configured maximum and uses the effective offset', async () => {
    const findMany = vi.fn(async () => []);
    const client = { album: { findMany, count: async () => 21 }, $connect: () => {} };
    client.$transaction = (run) => run(client);
    const service = createAlbumService({ repository: createAlbumRepository(client), config: { maxLimit: 10 } });
    const result = await service.list({ page: '2', limit: '24' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 21, totalPages: 3 });
});

it.each([
    ['newest', [{ createdAt: 'desc' }, { id: 'desc' }]],
    ['oldest', [{ createdAt: 'asc' }, { id: 'asc' }]],
    ['name', [{ name: 'asc' }, { id: 'asc' }]],
])('filters before pagination with stable %s ordering and matching totals', async (sort, orderBy) => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 7);
    const client = { album: { findMany, count } };
    client.$connect = () => {};
    client.$transaction = (run) => run(client);
    const repository = createAlbumRepository(client);
    const service = createAlbumService({ repository });
    const result = await service.list({ page: '2', limit: '3', q: ' Summer_% ', visibility: 'PUBLIC', sort });
    expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
            where: {
                deletedAt: null,
                visibility: 'PUBLIC',
                OR: [
                    { name: { contains: 'Summer\\_\\%', mode: 'insensitive' } },
                    { description: { contains: 'Summer\\_\\%', mode: 'insensitive' } },
                ],
            },
            orderBy,
            skip: 3,
            take: 3,
        }),
    );
    expect(count).toHaveBeenCalledWith({ where: findMany.mock.calls[0][0].where });
    expect(result.pagination).toEqual({ page: 2, limit: 3, total: 7, totalPages: 3 });
});

it.each(['sort=recent', 'sort=name&sort=oldest', 'visibility=private', 'visibility=PUBLIC&visibility=PRIVATE'])(
    'rejects invalid album list options: %s',
    async (query) => {
        const app = buildApp({ logger: false, albumService: createAlbumService({ repository: {} }) });
        try {
            const response = await app.inject(`/api/albums?${query}`);
            expect(response.statusCode).toBe(400);
        } finally {
            await app.close();
        }
    },
);
