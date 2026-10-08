import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';
import { createPrismaClient } from '#infrastructure/database/client.js';

import { createMediaListModule } from '../index.js';

// Isolated schema and rolled-back fixtures; never touches application media.
describe.skipIf(process.env.DATABASE_TESTS !== '1')('media list with PostgreSQL', () => {
    const schema = `media_list_test_${randomUUID().replaceAll('-', '')}`;
    let admin;
    let client;
    let schemaCreated = false;
    const ids = [1, 2, 3, 4, 5].map((n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
    const category = 'b0000000-0000-4000-8000-000000000001';
    const tag = 'b0000000-0000-4000-8000-000000000002';
    const album = 'b0000000-0000-4000-8000-000000000003';
    beforeAll(async () => {
        const config = validateDatabaseEnvironment(loadEnvironment());
        admin = new pg.Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 });
        await admin.connect();
        await admin.query(`CREATE SCHEMA "${schema}"`);
        schemaCreated = true;
        const migrations = new URL('../../../../prisma/migrations/', import.meta.url);
        for (const directory of (await readdir(migrations, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name))) {
            if (!(await readdir(new URL(`${directory.name}/`, migrations))).includes('migration.sql')) continue;
            await admin.query('BEGIN');
            try {
                await admin.query(`SET LOCAL search_path TO "${schema}"`);
                await admin.query(await readFile(new URL(`${directory.name}/migration.sql`, migrations), 'utf8'));
                await admin.query('COMMIT');
            } catch (error) {
                await admin.query('ROLLBACK');
                throw error;
            }
        }
        client = createPrismaClient(config, { schema });
        await client.$connect();
    });
    afterAll(async () => {
        await client?.$disconnect();
        try {
            if (schemaCreated) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
            await admin?.end();
        }
    });

    async function fixture(run) {
        const marker = new Error('rollback fixture');
        try {
            await client.$transaction(
                async (tx) => {
                    await tx.$queryRaw`SELECT set_config('search_path', ${schema}, true)`;
                    for (const [index, id] of ids.entries()) {
                        await tx.media.create({
                            data: {
                                id,
                                type: index === 2 ? 'VIDEO' : 'IMAGE',
                                status: index === 3 ? 'FAILED' : 'READY',
                                mimeType: index === 2 ? 'video/mp4' : 'image/jpeg',
                                extension: index === 2 ? 'mp4' : 'jpg',
                                fileSize: 100n,
                                originalFilename: ['Beach.jpg', 'Beach.jpg', 'clip.mp4', 'literal_%.jpg', 'z.jpg'][
                                    index
                                ],
                                createdAt: new Date(index < 3 ? '2026-01-01T00:00:00Z' : '2026-02-01T00:00:00Z'),
                                takenAt:
                                    index < 2
                                        ? new Date('2025-01-01T00:00:00Z')
                                        : index === 2
                                          ? new Date('2025-02-01T00:00:00Z')
                                          : null,
                            },
                        });
                    }
                    await tx.favorite.create({ data: { mediaId: ids[0] } });
                    await tx.category.create({
                        data: { id: category, name: 'Travel', slug: 'travel', media: { create: { mediaId: ids[0] } } },
                    });
                    await tx.tag.create({
                        data: { id: tag, name: 'Ocean', slug: 'ocean', media: { create: { mediaId: ids[1] } } },
                    });
                    await tx.album.create({
                        data: {
                            id: album,
                            name: 'Holiday',
                            slug: 'holiday',
                            description: 'Summer trip',
                            media: { create: { mediaId: ids[2] } },
                        },
                    });
                    const { service } = createMediaListModule({
                        client: tx,
                        storage: {
                            createPresignedDownloadUrl: async ({ key }) => ({ url: `https://assets.example/${key}` }),
                        },
                        config: { maxLimit: 200, urlExpirySeconds: 900 },
                    });
                    await run(tx, service);
                    throw marker;
                },
                { timeout: 15000 },
            );
        } catch (error) {
            if (error !== marker) throw error;
        }
    }

    it.each([
        ['createdAt', 'asc', [1, 2, 3, 4, 5]],
        ['createdAt', 'desc', [5, 4, 3, 2, 1]],
        ['takenAt', 'asc', [1, 2, 3, 4, 5]],
        ['takenAt', 'desc', [3, 2, 1, 5, 4]],
        ['filename', 'asc', [1, 2, 3, 4, 5]],
        ['filename', 'desc', [5, 4, 3, 2, 1]],
    ])('walks %s %s without gaps or duplicates across ties and nulls', async (sort, order, expected) => {
        await fixture(async (_tx, service) => {
            for (const limit of ['1', '2', '5', '10']) {
                const seen = [];
                let cursor;
                for (let count = 0; count < 6; count++) {
                    const page = await service.list({ sort, order, limit, ...(cursor ? { cursor } : {}) });
                    seen.push(...page.items.map((item) => item.id));
                    if (!page.hasMore) {
                        expect(page.nextCursor).toBeNull();
                        break;
                    }
                    expect(page.nextCursor).toBeTypeOf('string');
                    cursor = page.nextCursor;
                }
                expect(seen).toEqual(expected.map((n) => ids[n - 1]));
            }
        });
    });

    it.each([
        [{ q: 'bEaCh' }, [1, 2]],
        [{ q: 'ocean' }, [2]],
        [{ q: 'travel' }, [1]],
        [{ q: 'summer' }, [3]],
        [{ q: '_%' }, [4]],
        [{ type: 'VIDEO' }, [3]],
        [{ status: 'FAILED' }, [4]],
        [{ favorite: 'true' }, [1]],
        [{ favorite: 'false' }, [2, 3, 4, 5]],
        [{ category }, [1]],
        [{ tag }, [2]],
        [{ album }, [3]],
        [{ mimeType: 'video/mp4' }, [3]],
        [{ takenAtFrom: '2025-01-01T00:00:00Z', takenAtTo: '2025-01-01T00:00:00Z' }, [1, 2]],
        [{ takenAtFrom: '2025-02-01T00:00:00Z' }, [3]],
        [{ takenAtTo: '2025-01-01T00:00:00Z' }, [1, 2]],
        [{ createdAtFrom: '2026-02-01T00:00:00Z' }, [4, 5]],
        [{ createdAtTo: '2026-01-01T00:00:00Z' }, [1, 2, 3]],
        [{ q: 'Beach', category, favorite: 'true', type: 'IMAGE', status: 'READY' }, [1]],
        [{ q: 'Beach', tag, category }, []],
    ])('applies filter %j', async (filter, expected) => {
        await fixture(async (_tx, service) => {
            const page = await service.list({ ...filter, sort: 'createdAt', order: 'asc' });
            expect(page.items.map((item) => item.id)).toEqual(expected.map((n) => ids[n - 1]));
        });
    });

    it('continues from encoded values after deleting the anchor, ignoring newer insertions', async () => {
        await fixture(async (tx, service) => {
            const first = await service.list({ limit: '1' });
            expect(first.items[0].id).toBe(ids[4]);
            await tx.media.delete({ where: { id: ids[4] } });
            await tx.media.create({
                data: {
                    type: 'IMAGE',
                    originalFilename: 'new.jpg',
                    extension: 'jpg',
                    mimeType: 'image/jpeg',
                    fileSize: 10n,
                },
            });
            const next = await service.list({ cursor: first.nextCursor });
            expect(next.items.map((item) => item.id)).toEqual([ids[3], ids[2], ids[1], ids[0]]);
        });
    });

    it('excludes deleted media and deleted albums from membership and text search', async () => {
        await fixture(async (tx, service) => {
            await tx.media.update({ where: { id: ids[0] }, data: { deletedAt: new Date() } });
            await tx.album.update({ where: { id: album }, data: { deletedAt: new Date() } });
            expect((await service.list({})).items.map((item) => item.id)).not.toContain(ids[0]);
            expect((await service.list({ album })).items).toEqual([]);
            expect((await service.list({ q: 'Summer' })).items).toEqual([]);
        });
    });

    it('returns only thumbnail derivatives and gallery fields with optional values', async () => {
        await fixture(async (tx, service) => {
            await tx.mediaMetadata.create({ data: { mediaId: ids[0], rawMetadata: { private: 'EXIF' } } });
            for (const type of ['ORIGINAL', 'PREVIEW', 'THUMBNAIL']) {
                await tx.mediaVariant.create({
                    data: {
                        mediaId: ids[0],
                        type,
                        format: 'webp',
                        fileSize: 10n,
                        storageKey: `${ids[0]}/${type}.webp`,
                        width: 200,
                        height: 150,
                    },
                });
            }
            const page = await service.list({ favorite: 'true' });
            expect(page.items).toEqual([
                {
                    id: ids[0],
                    type: 'IMAGE',
                    originalFilename: 'Beach.jpg',
                    width: null,
                    height: null,
                    aspectRatio: null,
                    favorite: true,
                    takenAt: '2025-01-01T00:00:00.000Z',
                    thumbnails: [
                        {
                            name: 'default',
                            format: 'webp',
                            width: 200,
                            height: 150,
                            url: `https://assets.example/${ids[0]}/THUMBNAIL.webp`,
                        },
                    ],
                },
            ]);
            expect((await service.list({ status: 'FAILED' })).items[0]).toMatchObject({
                favorite: false,
                takenAt: null,
                thumbnails: [],
            });
        });
    });
});
