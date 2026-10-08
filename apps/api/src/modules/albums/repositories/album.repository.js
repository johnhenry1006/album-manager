import { createAlbumMediaRepository } from './albumMedia.repository.js';

const ALBUM_SELECT = {
    id: true,
    name: true,
    slug: true,
    description: true,
    visibility: true,
    coverMediaId: true,
    coverMedia: { select: { deletedAt: true } },
    createdAt: true,
    updatedAt: true,
};

export function createAlbumRepository(client, { inTransaction = typeof client.$connect !== 'function' } = {}) {
    const repository = {
        async transaction(run, { readOnly = false } = {}) {
            if (!inTransaction) {
                return client.$transaction((tx) => run(createAlbumRepository(tx, { inTransaction: true })), {
                    isolationLevel: readOnly ? 'RepeatableRead' : 'ReadCommitted',
                });
            }
            // Allow domain errors/unique conflicts to be caught by callers of an injected transaction.
            await client.$executeRaw`SAVEPOINT album_domain_write`;
            try {
                const result = await run(repository);
                await client.$executeRaw`RELEASE SAVEPOINT album_domain_write`;
                return result;
            } catch (error) {
                await client.$executeRaw`ROLLBACK TO SAVEPOINT album_domain_write`;
                await client.$executeRaw`RELEASE SAVEPOINT album_domain_write`;
                throw error;
            }
        },
        async lockAlbum(id) {
            await client.$queryRaw`SELECT id FROM albums WHERE id = ${id}::uuid FOR UPDATE`;
            return repository.findAlbum(id);
        },
        findAlbum(id) {
            return client.album.findFirst({ where: { id, deletedAt: null }, select: ALBUM_SELECT });
        },
        createAlbum(data) {
            return client.album.create({ data, select: ALBUM_SELECT });
        },
        updateAlbum(id, data) {
            return client.album.update({ where: { id }, data, select: ALBUM_SELECT });
        },
        listAlbums({ page, limit, q, visibility, sort = 'newest' }) {
            const text = q === undefined ? undefined : { contains: q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' };
            const where = {
                deletedAt: null,
                ...(visibility ? { visibility } : {}),
                ...(text ? { OR: [{ name: text }, { description: text }] } : {}),
            };
            return repository.transaction(
                async (tx) => {
                    const [rows, total] = await Promise.all([
                        tx.findAlbumPage(where, page, limit, sort),
                        tx.countAlbums(where),
                    ]);
                    return { rows, total };
                },
                { readOnly: true },
            );
        },
        findAlbumPage(where, page, limit, sort = 'newest') {
            const orderBy = {
                newest: [{ createdAt: 'desc' }, { id: 'desc' }],
                oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
                name: [{ name: 'asc' }, { id: 'asc' }],
            }[sort];
            return client.album.findMany({
                where,
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
                select: ALBUM_SELECT,
            });
        },
        countAlbums(where) {
            return client.album.count({ where });
        },
        async counts(albumId) {
            const groups = await client.media.groupBy({
                by: ['type'],
                where: { deletedAt: null, albums: { some: { albumId } } },
                _count: { _all: true },
            });
            const counts = { media: 0, images: 0, videos: 0 };
            for (const group of groups) {
                counts.media += group._count._all;
                counts[group.type === 'IMAGE' ? 'images' : 'videos'] = group._count._all;
            }
            return counts;
        },
        ...createAlbumMediaRepository(client),
    };
    return Object.freeze(repository);
}
