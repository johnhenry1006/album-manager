import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { buildApp } from '../../../app/app.js';
import { createTaxonomyModule } from '../index.js';

const mediaIds = [1, 2, 3].map((n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);

describe.skipIf(process.env.DATABASE_TESTS !== '1')('taxonomy with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

    it.each(['categories', 'tags'])(
        'persists %s through all routes, rolls back invalid batches and cascades only assignments',
        async (kind) => {
            await database.rollback(async (tx) => {
                for (const [index, id] of mediaIds.entries())
                    await tx.media.create({
                        data: {
                            id,
                            type: 'IMAGE',
                            originalFilename: 'test.jpg',
                            mimeType: 'image/jpeg',
                            extension: 'jpg',
                            fileSize: 10n,
                            ...(index === 2 ? { deletedAt: new Date() } : {}),
                        },
                    });
                const { service } = createTaxonomyModule({ client: tx });
                const app = buildApp({ logger: false, taxonomyService: service });
                const field = kind === 'categories' ? 'categoryIds' : 'tagIds';
                const model = kind === 'categories' ? tx.mediaCategory : tx.mediaTag;
                try {
                    const response = await app.inject({
                        method: 'POST',
                        url: `/api/${kind}`,
                        payload: { name: 'Literal_%', slug: 'literal' },
                    });
                    expect(response.statusCode).toBe(201);
                    const item = response.json();
                    const other = await service[kind].create({ name: 'Other', slug: 'other' });
                    expect((await app.inject(`/api/${kind}?q=_%`)).json()).toMatchObject({
                        items: [{ id: item.id }],
                        pagination: { total: 1 },
                    });
                    expect((await service[kind].list({ limit: '1', page: '2' })).items).toHaveLength(1);
                    await expect(
                        service[kind].update(other.id, { slug: 'literal', name: 'Corrupt' }),
                    ).rejects.toMatchObject({ statusCode: 409 });
                    expect((await service[kind].list({ q: 'Other' })).items[0].name).toBe('Other');
                    expect(
                        (
                            await app.inject({
                                method: 'PATCH',
                                url: `/api/${kind}/${item.id}`,
                                payload: { name: 'Trip' },
                            })
                        ).json().name,
                    ).toBe('Trip');
                    for (let n = 0; n < 2; n++)
                        expect(
                            (
                                await app.inject({
                                    method: 'POST',
                                    url: `/api/media/${mediaIds[0]}/${kind}`,
                                    payload: { [field]: [item.id] },
                                })
                            ).statusCode,
                        ).toBe(200);
                    expect(await model.count()).toBe(1);
                    expect(
                        (
                            await app.inject({
                                method: 'POST',
                                url: `/api/media/${kind}`,
                                payload: { mediaIds: mediaIds.slice(0, 2), [field]: [other.id] },
                            })
                        ).statusCode,
                    ).toBe(200);
                    expect(await model.count()).toBe(3);
                    await expect(service[kind].assignBatch({ mediaIds, [field]: [item.id] })).rejects.toMatchObject({
                        statusCode: 404,
                    });
                    await expect(
                        service[kind].assignBatch({ mediaIds: mediaIds.slice(0, 2), [field]: [item.id, mediaIds[2]] }),
                    ).rejects.toMatchObject({ statusCode: 404 });
                    expect(await model.count()).toBe(3);
                    expect((await app.inject({ method: 'DELETE', url: `/api/${kind}/${item.id}` })).statusCode).toBe(
                        204,
                    );
                    expect(await model.count()).toBe(2);
                    expect(await tx.media.count()).toBe(3);
                    expect((await app.inject({ method: 'DELETE', url: `/api/${kind}/${item.id}` })).statusCode).toBe(
                        404,
                    );
                } finally {
                    await app.close();
                }
            });
        },
    );

    it('rejects cycles, protects parents and returns a full tree', async () => {
        await database.rollback(async (tx) => {
            const { categories } = createTaxonomyModule({ client: tx }).service;
            const root = await categories.create({ name: 'Root' });
            const child = await categories.create({ name: 'Child', parentId: root.id });
            const leaf = await categories.create({ name: 'Leaf', parentId: child.id });
            await expect(categories.update(root.id, { parentId: leaf.id })).rejects.toMatchObject({ statusCode: 400 });
            await expect(categories.update(child.id, { parentId: child.id })).rejects.toMatchObject({
                statusCode: 400,
            });
            await expect(categories.remove(root.id)).rejects.toMatchObject({ statusCode: 409 });
            expect(await categories.list({ tree: 'true' })).toMatchObject({
                items: [{ id: root.id, children: [{ id: child.id, children: [{ id: leaf.id }] }] }],
            });
            await categories.update(child.id, { parentId: null });
            await categories.remove(root.id);
            expect(await tx.category.count()).toBe(2);
        });
    });

    it('serializes opposing reparent operations so only one can succeed', async () => {
        await database.withClient(async (client, schema) => {
            const scoped = {
                $connect: () => client.$connect(),
                $transaction: (run, options) =>
                    client.$transaction(async (tx) => {
                        await tx.$queryRaw`SELECT set_config('search_path', ${schema}, true)`;
                        return run(tx);
                    }, options),
            };
            const { categories } = createTaxonomyModule({ client: scoped }).service;
            const a = await categories.create({ name: 'A' });
            const b = await categories.create({ name: 'B' });
            try {
                const results = await Promise.allSettled([
                    categories.update(a.id, { parentId: b.id }),
                    categories.update(b.id, { parentId: a.id }),
                ]);
                expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
                expect(results.find((r) => r.status === 'rejected').reason.statusCode).toBe(400);
                expect((await categories.list({ tree: 'true' })).items).toHaveLength(1);
            } finally {
                await client.category.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { parentId: null } });
                await client.category.deleteMany({ where: { id: { in: [a.id, b.id] } } });
            }
        });
    });
});
