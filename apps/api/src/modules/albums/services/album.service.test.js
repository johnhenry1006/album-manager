import { describe, expect, it } from 'vitest';

import { albumId, fixture, mediaId, otherMediaId } from './album.testUtils.js';

describe('album domain', () => {
    it('creates with defaults, generates distinct slugs and rejects reserved slug collisions', async () => {
        const { service } = fixture();
        const first = await service.create({ name: '  Summer Trip  ' });
        const second = await service.create({ name: 'Summer Trip' });
        expect(first).toMatchObject({ name: 'Summer Trip', visibility: 'PRIVATE', coverMediaId: null });
        expect(first.slug).not.toBe(second.slug);
        await expect(service.create({ name: 'Trip', slug: 'trip' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('lists paginated search results and returns live counts on detail', async () => {
        const { service, media } = fixture();
        media.get(otherMediaId).type = 'VIDEO';
        await service.addMedia(albumId, { mediaId });
        await service.addMedia(albumId, { mediaId: otherMediaId });
        expect(await service.list({ q: 'TRIP', page: '1', limit: '1' })).toMatchObject({
            items: [{ id: albumId }],
            pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
        });
        expect(await service.detail(albumId)).toMatchObject({ counts: { media: 2, images: 1, videos: 1 } });
        media.get(otherMediaId).deletedAt = new Date();
        expect(await service.detail(albumId)).toMatchObject({ counts: { media: 1, images: 1, videos: 0 } });
    });

    it('soft-deletes the album while retaining media and memberships', async () => {
        const { service, albums, media, memberships } = fixture();
        await service.addMedia(albumId, { mediaId });
        await service.remove(albumId);
        expect(albums.get(albumId).deletedAt).toBeInstanceOf(Date);
        expect(media.get(mediaId).deletedAt).toBeNull();
        expect(memberships.size).toBe(1);
        expect((await service.list({})).items).toEqual([]);
        for (const run of [
            () => service.detail(albumId),
            () => service.update(albumId, { name: 'New' }),
            () => service.remove(albumId),
            () => service.listMedia(albumId, {}, { id: '00000000-0000-4000-8000-000000000001' }),
            () => service.addMedia(albumId, { mediaId }),
            () => service.removeMedia(albumId, mediaId),
        ])
            await expect(run()).rejects.toMatchObject({ statusCode: 404 });
    });

    it('shares media across albums, appends, preserves repeated membership and changes explicit position', async () => {
        const { service, media } = fixture();
        const second = await service.create({ name: 'Other' });
        const firstMember = await service.addMedia(albumId, { mediaId, position: 7 });
        expect(await service.addMedia(albumId, { mediaId })).toEqual(firstMember);
        expect(await service.addMedia(albumId, { mediaId: otherMediaId })).toMatchObject({ position: 8 });
        expect(await service.addMedia(albumId, { mediaId, position: 2 })).toMatchObject({
            membershipId: firstMember.membershipId,
            position: 2,
        });
        await service.addMedia(second.id, { mediaId });
        await service.removeMedia(albumId, mediaId);
        expect(
            (await service.listMedia(second.id, {}, { id: '00000000-0000-4000-8000-000000000001' })).items.map(
                (row) => row.id,
            ),
        ).toEqual([mediaId]);
        expect(media.get(mediaId).deletedAt).toBeNull();
    });

    it('requires live cover membership, supports changing and clearing cover, and clears a removed cover', async () => {
        const { service, media } = fixture();
        await expect(service.update(albumId, { coverMediaId: mediaId })).rejects.toMatchObject({ statusCode: 400 });
        await service.addMedia(albumId, { mediaId });
        await service.addMedia(albumId, { mediaId: otherMediaId });
        expect(await service.update(albumId, { coverMediaId: mediaId })).toMatchObject({ coverMediaId: mediaId });
        expect(await service.update(albumId, { coverMediaId: otherMediaId })).toMatchObject({
            coverMediaId: otherMediaId,
        });
        expect(await service.update(albumId, { coverMediaId: null })).toMatchObject({ coverMediaId: null });
        await service.update(albumId, { coverMediaId: mediaId });
        await service.removeMedia(albumId, mediaId);
        expect(await service.detail(albumId)).toMatchObject({ coverMediaId: null });
        media.get(otherMediaId).deletedAt = new Date();
        await expect(service.update(albumId, { coverMediaId: otherMediaId })).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(service.addMedia(albumId, { mediaId: otherMediaId })).rejects.toMatchObject({ statusCode: 404 });
        await expect(service.removeMedia(albumId, mediaId)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('paginates tied positions and survives deletion of the cursor anchor', async () => {
        const { service } = fixture();
        await service.addMedia(albumId, { mediaId, position: 3 });
        await service.addMedia(albumId, { mediaId: otherMediaId, position: 3 });
        const first = await service.listMedia(albumId, { limit: '1' }, { id: '00000000-0000-4000-8000-000000000001' });
        expect(first.hasMore).toBe(true);
        expect(JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString())).toEqual({
            v: 1,
            albumId,
            position: 3,
            id: first.items[0].membershipId,
        });
        await service.removeMedia(albumId, first.items[0].id);
        const next = await service.listMedia(
            albumId,
            { limit: '1', cursor: first.nextCursor },
            { id: '00000000-0000-4000-8000-000000000001' },
        );
        expect(next.items).toHaveLength(1);
        expect(next.items[0].id).not.toBe(first.items[0].id);
        expect(next).toMatchObject({ hasMore: false, nextCursor: null });
    });

    it('returns only compact media and signed thumbnail fields', async () => {
        const { service, media } = fixture();
        Object.assign(media.get(mediaId), {
            metadata: { secret: true },
            variants: [{ name: 'small', format: 'webp', width: 100, height: 75, storageKey: 'thumb.webp' }],
        });
        await service.addMedia(albumId, { mediaId });
        const item = (await service.listMedia(albumId, {}, { id: '00000000-0000-4000-8000-000000000001' })).items[0];
        expect(item.thumbnails).toEqual([
            { name: 'small', format: 'webp', width: 100, height: 75, url: 'https://assets.example/thumb.webp' },
        ]);
        expect(item).not.toHaveProperty('metadata');
        expect(JSON.stringify(item)).not.toContain('storageKey');
    });

    it.each([
        {},
        { name: '' },
        { name: 1 },
        { name: 'x', extra: true },
        { name: 'x', visibility: 'INVALID' },
        { name: 'x', slug: 'Bad Slug' },
        { name: 'x', coverMediaId: mediaId },
        { name: 'x', description: '\u0000' },
    ])('rejects invalid creation %j', async (body) => {
        await expect(fixture().service.create(body)).rejects.toMatchObject({ statusCode: 400 });
    });

    it.each(['page=0', 'page=1.5', 'page=100000000000', 'limit=201', 'limit=0', 'limit=1e2', 'q=', 'extra=1'])(
        'rejects invalid album query %s',
        async (text) => {
            const { service, reads } = fixture();
            await expect(service.list(Object.fromEntries(new URLSearchParams(text)))).rejects.toMatchObject({
                statusCode: 400,
            });
            expect(reads()).toBe(0);
        },
    );

    it.each([
        { mediaId: 'bad' },
        { mediaId, position: -1 },
        { mediaId, position: 2147483648 },
        { mediaId, position: '2' },
        { mediaId, extra: true },
    ])('rejects invalid member input %j', async (body) => {
        await expect(fixture().service.addMedia(albumId, body)).rejects.toMatchObject({ statusCode: 400 });
    });

    it.each([
        'bad',
        '',
        Buffer.from(JSON.stringify({ v: 1, albumId: mediaId, position: 0, id: mediaId })).toString('base64url'),
        Buffer.from(JSON.stringify({ v: 1, albumId, position: -1, id: mediaId })).toString('base64url'),
    ])('rejects malformed or foreign cursor %s before persistence', async (cursor) => {
        const { service, reads } = fixture();
        await expect(
            service.listMedia(albumId, { cursor }, { id: '00000000-0000-4000-8000-000000000001' }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(reads()).toBe(0);
    });

    it('rejects invalid IDs, empty patches, repeated query fields, and position overflow', async () => {
        const { service } = fixture();
        await expect(service.detail('bad')).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.update(albumId, {})).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.list({ page: ['1', '2'] })).rejects.toMatchObject({ statusCode: 400 });
        await service.addMedia(albumId, { mediaId, position: 2147483647 });
        await expect(service.addMedia(albumId, { mediaId: otherMediaId })).rejects.toMatchObject({ statusCode: 400 });
    });
    it('caps album page sizes at 200 even when the media configuration permits more', async () => {
        const { service } = fixture({ maxLimit: 1000, urlExpirySeconds: 900 });
        await expect(service.list({ limit: '201' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            service.listMedia(albumId, { limit: '201' }, { id: '00000000-0000-4000-8000-000000000001' }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect((await service.list({ limit: '200' })).pagination.limit).toBe(200);
    });
});
