import { randomUUID } from 'node:crypto';

import { createAlbumService } from './album.service.js';

export const albumId = 'a0000000-0000-4000-8000-000000000001';
export const mediaId = 'b0000000-0000-4000-8000-000000000001';
export const otherMediaId = 'b0000000-0000-4000-8000-000000000002';

// In-memory port for domain tests. Persistence and locking are tested with PostgreSQL.
export function fixture(config = { maxLimit: 200, urlExpirySeconds: 900 }) {
    const date = new Date('2026-10-01T00:00:00.000Z');
    const albums = new Map([
        [
            albumId,
            {
                id: albumId,
                name: 'Trip',
                slug: 'trip',
                description: null,
                visibility: 'PRIVATE',
                coverMediaId: null,
                createdAt: date,
                updatedAt: date,
                deletedAt: null,
            },
        ],
    ]);
    const media = new Map(
        [mediaId, otherMediaId].map((id) => [
            id,
            {
                id,
                deletedAt: null,
                type: 'IMAGE',
                originalFilename: 'photo.jpg',
                width: null,
                height: null,
                aspectRatio: null,
                takenAt: null,
                favorites: [],
                variants: [],
            },
        ]),
    );
    const memberships = new Map();
    let reads = 0;
    const key = (album, member) => `${album}:${member}`;
    const repository = {
        async transaction(run) {
            return run(repository);
        },
        async lockAlbum(id) {
            return repository.findAlbum(id);
        },
        async findAlbum(id) {
            reads++;
            const row = albums.get(id);
            return row && row.deletedAt === null ? row : null;
        },
        async createAlbum(data) {
            if ([...albums.values()].some((row) => row.slug === data.slug))
                throw Object.assign(new Error('Unique slug'), { code: 'P2002' });
            const row = {
                id: randomUUID(),
                description: null,
                coverMediaId: null,
                visibility: 'PRIVATE',
                createdAt: date,
                updatedAt: date,
                deletedAt: null,
                ...data,
            };
            albums.set(row.id, row);
            return row;
        },
        async updateAlbum(id, data) {
            Object.assign(albums.get(id), data);
            return albums.get(id);
        },
        async listAlbums({ page, limit, q }) {
            const rows = [...albums.values()].filter(
                (row) =>
                    row.deletedAt === null &&
                    (!q || `${row.name} ${row.description}`.toLowerCase().includes(q.toLowerCase())),
            );
            return { rows: rows.slice((page - 1) * limit, page * limit), total: rows.length };
        },
        async counts(id) {
            const members = [...memberships.values()].filter(
                (row) => row.albumId === id && media.get(row.mediaId)?.deletedAt === null,
            );
            const images = members.filter((row) => media.get(row.mediaId).type === 'IMAGE').length;
            return { media: members.length, images, videos: members.length - images };
        },
        async lockMedia(id) {
            const row = media.get(id);
            return row?.deletedAt === null ? row : null;
        },
        async findMembership(album, member) {
            return memberships.get(key(album, member)) ?? null;
        },
        async maxPosition(album) {
            return Math.max(
                -1,
                ...[...memberships.values()].filter((row) => row.albumId === album).map((row) => row.position),
            );
        },
        async assignMembership(album, member, position) {
            const row = memberships.get(key(album, member)) ?? {
                id: randomUUID(),
                albumId: album,
                mediaId: member,
                createdAt: date,
            };
            row.position = position;
            memberships.set(key(album, member), row);
            return row;
        },
        async removeMembership(album, member) {
            memberships.delete(key(album, member));
        },
        async findMediaPage(album, { limit, cursor }) {
            reads++;
            return [...memberships.values()]
                .filter(
                    (row) =>
                        row.albumId === album &&
                        media.get(row.mediaId)?.deletedAt === null &&
                        (!cursor ||
                            row.position > cursor.position ||
                            (row.position === cursor.position && row.id > cursor.id)),
                )
                .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
                .slice(0, limit + 1)
                .map((row) => ({ ...row, media: media.get(row.mediaId) }));
        },
    };
    const service = createAlbumService({
        repository,
        storage: {
            createPresignedDownloadUrl: async ({ key: storageKey }) => ({
                url: `https://assets.example/${storageKey}`,
            }),
        },
        config,
    });
    return { service, albums, media, memberships, reads: () => reads };
}
