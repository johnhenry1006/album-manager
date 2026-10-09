import { createMediaGalleryItem } from '#modules/media/index.js';
import { requireActorId } from '#shared/validation/actor.js';

import { mapAlbumMembership } from '../mappers/album.mapper.js';
import { validateAlbumId } from '../validators/album.validator.js';
import { validateAlbumMediaQuery, validateAlbumMembership } from '../validators/albumMedia.validator.js';
import { encodeAlbumMediaCursor, validatePosition } from '../validators/albumMediaCursor.js';
import { notFound } from './album.errors.js';
import { requireAlbum } from './albumAccess.service.js';

export function createAlbumMediaService({ repository, storage, config }) {
    return {
        async listMedia(id, input, actor) {
            const userId = requireActorId(actor);
            const albumId = validateAlbumId(id);
            const query = validateAlbumMediaQuery(input, albumId, config);
            const rows = await repository.transaction(
                async (tx) => {
                    await requireAlbum(tx, albumId);
                    return tx.findMediaPage(albumId, query, userId);
                },
                { readOnly: true },
            );
            const hasMore = rows.length > query.limit;
            const page = rows.slice(0, query.limit);
            const items = await Promise.all(
                page.map(async (row) => ({
                    ...(await createMediaGalleryItem(row.media, {
                        storage,
                        urlExpirySeconds: config.urlExpirySeconds,
                    })),
                    membershipId: row.id,
                    position: row.position,
                })),
            );
            return { items, nextCursor: hasMore ? encodeAlbumMediaCursor(page.at(-1), albumId, query) : null, hasMore };
        },
        async addMedia(id, input) {
            const albumId = validateAlbumId(id);
            const data = validateAlbumMembership(input);
            return repository.transaction(async (tx) => {
                await requireAlbum(tx, albumId, { lock: true });
                if (!(await tx.lockMedia(data.mediaId))) throw notFound('Media');
                const member = await tx.findMembership(albumId, data.mediaId);
                if (member && data.position === undefined) return mapAlbumMembership(member);
                const position = data.position ?? validatePosition((await tx.maxPosition(albumId)) + 1);
                return mapAlbumMembership(await tx.assignMembership(albumId, data.mediaId, position));
            });
        },
        async removeMedia(id, memberId) {
            const albumId = validateAlbumId(id);
            const mediaId = validateAlbumId(memberId);
            await repository.transaction(async (tx) => {
                const album = await requireAlbum(tx, albumId, { lock: true });
                if (!(await tx.findMembership(albumId, mediaId))) throw notFound('Album membership');
                if (album.coverMediaId === mediaId) await tx.updateAlbum(albumId, { coverMediaId: null });
                await tx.removeMembership(albumId, mediaId);
            });
        },
    };
}
