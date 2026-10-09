import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildApp } from '../../../app/app.js';
import { createTaxonomyService } from './taxonomy.service.js';

export const mediaIds = [1, 2, 3].map((n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);

// Only persistence is substituted here; HTTP, validation and domain services are real.
function fixture(kind = 'categories') {
    const rows = new Map();
    const assignments = new Set();
    const date = new Date('2026-10-08T00:00:00Z');
    const repository = {
        transaction: async (run) => run(repository),
        lock: async () => {},
        find: async (id) => rows.get(id),
        findEntityIds: async (ids) => ids.filter((id) => rows.has(id)),
        children: async (id) => [...rows.values()].filter((row) => row.parentId === id).length,
        create: async (data) => {
            if ([...rows.values()].some((row) => row.slug === data.slug)) throw { code: 'P2002' };
            const row = {
                id: randomUUID(),
                createdAt: date,
                updatedAt: date,
                ...(kind === 'categories' ? { parentId: null } : {}),
                ...data,
            };
            rows.set(row.id, row);
            return row;
        },
        update: async (id, data) => {
            if ([...rows.values()].some((row) => row.id !== id && row.slug === data.slug)) throw { code: 'P2002' };
            Object.assign(rows.get(id), data);
            return rows.get(id);
        },
        remove: async (id) => {
            rows.delete(id);
            for (const key of assignments) if (key.endsWith(`:${id}`)) assignments.delete(key);
        },
        list: async ({ page, limit }) => ({
            rows: [...rows.values()].slice((page - 1) * limit, page * limit),
            total: rows.size,
        }),
        treeRows: async () => [...rows.values()],
        lockMedia: async (ids) => ids.filter((id) => mediaIds.slice(0, 2).includes(id)),
        assign: async (ids, entityIds) => {
            for (const id of ids) for (const entityId of entityIds) assignments.add(`${id}:${entityId}`);
        },
    };
    return { service: createTaxonomyService({ repository, kind }), rows, assignments };
}

describe.each(['categories', 'tags'])('%s domain and HTTP', (kind) => {
    it('creates normalized metadata, updates, paginates and deletes', async () => {
        const { service } = fixture(kind);
        const item = await service.create({ name: '  Travel  ', slug: 'travel' });
        expect(item).toMatchObject({ name: 'Travel', slug: 'travel', createdAt: '2026-10-08T00:00:00.000Z' });
        await service.create({ name: 'Other' });
        expect(await service.list({ limit: '1', page: '2' })).toMatchObject({
            items: [{ name: 'Other' }],
            pagination: { total: 2, totalPages: 2 },
        });
        expect(await service.update(item.id, { name: 'Trip' })).toMatchObject({ name: 'Trip' });
        await service.remove(item.id);
        await expect(service.update(item.id, { name: 'Gone' })).rejects.toMatchObject({ statusCode: 404 });
        expect((await service.list({})).pagination.total).toBe(1);
    });

    it('returns conflicts for unique slugs on create and update', async () => {
        const { service } = fixture(kind);
        await service.create({ name: 'One', slug: 'one' });
        const other = await service.create({ name: 'Two', slug: 'two' });
        await expect(service.create({ name: 'Conflict', slug: 'one' })).rejects.toMatchObject({ statusCode: 409 });
        await expect(service.update(other.id, { slug: 'one' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it.each([null, [], {}, { name: '' }, { name: 'x\n' }, { name: 'x', extra: true }, { name: 'x', slug: 'BAD' }])(
        'rejects malformed create input %j',
        async (body) => {
            await expect(fixture(kind).service.create(body)).rejects.toMatchObject({ statusCode: 400 });
        },
    );

    it('rejects malformed IDs, empty updates and unknown or oversized list queries', async () => {
        const { service } = fixture(kind);
        await expect(service.update('bad', { name: 'x' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.update(mediaIds[0], {})).rejects.toMatchObject({ statusCode: 400 });
        for (const query of [{ limit: '201' }, { page: '0' }, { q: [] }, { extra: 'x' }, { page: '2147483647' }])
            await expect(service.list(query)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('adds assignments idempotently, batches selected media and preserves prior assignments', async () => {
        const { service, assignments } = fixture(kind);
        const one = await service.create({ name: 'One' });
        const two = await service.create({ name: 'Two' });
        const field = kind === 'categories' ? 'categoryIds' : 'tagIds';
        await service.assignMedia(mediaIds[0], { [field]: [one.id, one.id] });
        await service.assignMedia(mediaIds[0], { [field]: [one.id] });
        expect(assignments.size).toBe(1);
        expect(await service.assignBatch({ mediaIds: mediaIds.slice(0, 2), [field]: [two.id] })).toMatchObject({
            mediaIds: mediaIds.slice(0, 2),
            [field]: [two.id],
        });
        expect(assignments.size).toBe(3);
        await service.remove(one.id);
        expect(assignments.size).toBe(2);
    });

    it('validates all batch targets before writing and rejects deleted media', async () => {
        const { service, assignments } = fixture(kind);
        const one = await service.create({ name: 'One' });
        const field = kind === 'categories' ? 'categoryIds' : 'tagIds';
        await expect(service.assignBatch({ mediaIds, [field]: [one.id] })).rejects.toMatchObject({ statusCode: 404 });
        await expect(
            service.assignBatch({ mediaIds: [mediaIds[0]], [field]: [one.id, mediaIds[1]] }),
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(assignments.size).toBe(0);
        for (const body of [
            {},
            { mediaIds: [], [field]: [one.id] },
            { mediaIds: [mediaIds[0]], [field]: [] },
            { mediaIds: [mediaIds[0]], [field]: [null] },
            { mediaIds: Array(101).fill(mediaIds[0]), [field]: [one.id] },
        ])
            await expect(service.assignBatch(body)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('registers CRUD, individual and batch assignment routes with centralized errors', async () => {
        const { service } = fixture(kind);
        const app = buildApp({ logger: false, taxonomyService: { [kind]: service } });
        try {
            const created = await app.inject({ method: 'POST', url: `/api/${kind}`, payload: { name: 'Trip' } });
            expect(created.statusCode).toBe(201);
            const id = created.json().id;
            expect((await app.inject(`/api/${kind}`)).json().items).toHaveLength(1);
            expect(
                (await app.inject({ method: 'PATCH', url: `/api/${kind}/${id}`, payload: { name: 'Updated' } })).json()
                    .name,
            ).toBe('Updated');
            const field = kind === 'categories' ? 'categoryIds' : 'tagIds';
            expect(
                (
                    await app.inject({
                        method: 'POST',
                        url: `/api/media/${mediaIds[0]}/${kind}`,
                        payload: { [field]: [id] },
                    })
                ).statusCode,
            ).toBe(200);
            expect(
                (
                    await app.inject({
                        method: 'POST',
                        url: `/api/media/${kind}`,
                        payload: { mediaIds: mediaIds.slice(0, 2), [field]: [id] },
                    })
                ).statusCode,
            ).toBe(200);
            expect((await app.inject({ method: 'DELETE', url: `/api/${kind}/${id}` })).statusCode).toBe(204);
            expect((await app.inject({ method: 'PATCH', url: `/api/${kind}/bad`, payload: {} })).statusCode).toBe(400);
        } finally {
            await app.close();
        }
    });
});

describe('category hierarchy', () => {
    it('serializes a deeply nested valid tree without overflowing the stack', async () => {
        const { service, rows } = fixture();
        const date = new Date('2026-10-08T00:00:00Z');
        let parentId = null;
        for (let n = 0; n < 4000; n++) {
            const id = randomUUID();
            rows.set(id, {
                id,
                name: 'Deep "category"',
                slug: `deep-${n}`,
                parentId,
                createdAt: date,
                updatedAt: date,
            });
            parentId = id;
        }
        const app = buildApp({ logger: false, taxonomyService: { categories: service } });
        try {
            const response = await app.inject('/api/categories?tree=true');
            expect(response.statusCode).toBe(200);
            let nodes = response.json().items;
            let count = 0;
            while (nodes.length) {
                expect(nodes[0].name).toBe('Deep "category"');
                count++;
                nodes = nodes[0].children;
            }
            expect(count).toBe(4000);
        } finally {
            await app.close();
        }
    });

    it('rejects missing parents, self-parenting, and ancestor cycles without modifying the hierarchy', async () => {
        const { service, rows } = fixture();
        const root = await service.create({ name: 'Root' });
        const child = await service.create({ name: 'Child', parentId: root.id });
        const leaf = await service.create({ name: 'Leaf', parentId: child.id });
        await expect(service.create({ name: 'Orphan', parentId: mediaIds[0] })).rejects.toMatchObject({
            statusCode: 404,
        });
        for (const parentId of [root.id, child.id, leaf.id])
            await expect(service.update(root.id, { parentId })).rejects.toMatchObject({ statusCode: 400 });
        expect(rows.get(root.id).parentId).toBeNull();
        await expect(service.remove(root.id)).rejects.toMatchObject({ statusCode: 409 });
        await service.update(child.id, { parentId: null });
        await service.remove(root.id);
        expect(rows.has(root.id)).toBe(false);
    });

    it('returns a complete nested tree and rejects ambiguous tree pagination', async () => {
        const { service } = fixture();
        const root = await service.create({ name: 'Root' });
        const child = await service.create({ name: 'Child', parentId: root.id });
        expect(await service.list({ tree: 'true' })).toMatchObject({
            items: [{ id: root.id, children: [{ id: child.id, children: [] }] }],
        });
        await expect(service.list({ tree: 'true', limit: '1' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.list({ tree: 'maybe' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(fixture('tags').service.create({ name: 'Tag', parentId: null })).rejects.toMatchObject({
            statusCode: 400,
        });
    });
});
