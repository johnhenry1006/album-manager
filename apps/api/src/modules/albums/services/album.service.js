import { randomUUID } from 'node:crypto';

import { mapAlbum } from '../mappers/album.mapper.js';
import { validateAlbum, validateAlbumId, validateAlbumListQuery } from '../validators/album.validator.js';
import { albumWrite, invalid } from './album.errors.js';
import { requireAlbum } from './albumAccess.service.js';
import { createAlbumMediaService } from './albumMedia.service.js';

function generatedSlug(name) {
    const stem = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 180)
        .replace(/-$/, '');
    return `${stem || 'album'}-${randomUUID()}`;
}

export function createAlbumService({ repository, storage, config = { maxLimit: 200, urlExpirySeconds: 900 } }) {
    return Object.freeze({
        async list(input) {
            const query = validateAlbumListQuery(input, config);
            const { rows, total } = await repository.listAlbums(query);
            return {
                items: rows.map((row) => mapAlbum(row)),
                pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
            };
        },
        async create(input) {
            const data = validateAlbum(input, { create: true });
            data.slug ??= generatedSlug(data.name);
            return albumWrite(() => repository.transaction(async (tx) => mapAlbum(await tx.createAlbum(data))));
        },
        async detail(id) {
            const albumId = validateAlbumId(id);
            return repository.transaction(
                async (tx) => {
                    const album = await requireAlbum(tx, albumId);
                    return mapAlbum(album, await tx.counts(albumId));
                },
                { readOnly: true },
            );
        },
        async update(id, input) {
            const albumId = validateAlbumId(id);
            const data = validateAlbum(input);
            return albumWrite(() =>
                repository.transaction(async (tx) => {
                    await requireAlbum(tx, albumId, { lock: true });
                    if (data.coverMediaId !== undefined && data.coverMediaId !== null) {
                        const media = await tx.lockMedia(data.coverMediaId);
                        if (!media || !(await tx.findMembership(albumId, data.coverMediaId)))
                            throw invalid('Cover must be live media belonging to this album');
                    }
                    return mapAlbum(await tx.updateAlbum(albumId, data));
                }),
            );
        },
        async remove(id) {
            const albumId = validateAlbumId(id);
            await repository.transaction(async (tx) => {
                await requireAlbum(tx, albumId, { lock: true });
                await tx.updateAlbum(albumId, { deletedAt: new Date() });
            });
        },
        ...createAlbumMediaService({ repository, storage, config }),
    });
}
