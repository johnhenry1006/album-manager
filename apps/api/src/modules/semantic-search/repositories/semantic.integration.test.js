import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { createSemanticRepository } from './semantic.repository.js';

const profile = { space: 'fixture-v1', model: 'fixture-1', dimensions: 2 };
const ids = [1, 2, 3].map((n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const checksum = 'a'.repeat(64);
const database = createIsolatedTestDatabase();
describe.skipIf(process.env.DATABASE_TESTS !== '1')('semantic PostgreSQL index', () => {
    beforeAll(() => database.open());
    afterAll(() => database.close());
    async function fixture(tx) {
        const repo = createSemanticRepository(tx, { inTransaction: true });
        for (const [n, id] of ids.entries()) {
            await tx.media.create({
                data: {
                    id,
                    type: 'IMAGE',
                    status: 'READY',
                    originalFilename: 'photo.jpg',
                    mimeType: 'image/jpeg',
                    extension: 'jpg',
                    fileSize: 100n,
                    checksum,
                },
            });
            await tx.mediaVariant.create({
                data: {
                    mediaId: id,
                    type: 'ORIGINAL',
                    format: 'jpg',
                    fileSize: 100n,
                    storageKey: `existing/${id}.jpg`,
                },
            });
            await repo.save({
                mediaId: id,
                ...profile,
                sourceChecksum: checksum,
                vector: n === 2 ? [0, 1] : [1, 0],
                tags: [],
                tagRevision: 'none',
                status: 'READY',
            });
        }
        return repo;
    }
    it('ranks known vectors and paginates equal scores by media ID', async () =>
        database.rollback(async (tx) => {
            const repo = await fixture(tx);
            const rows = await repo.search({ profile, vector: [1, 0], excludeId: null, limit: 2, cursor: null });
            expect(rows).toEqual([
                { id: ids[0], score: 1 },
                { id: ids[1], score: 1 },
            ]);
            expect(
                await repo.search({
                    profile,
                    vector: [1, 0],
                    excludeId: null,
                    limit: 2,
                    cursor: { score: 1, id: ids[1] },
                }),
            ).toEqual([{ id: ids[2], score: 0 }]);
            expect(
                (await repo.search({ profile, vector: [1, 0], excludeId: ids[0], limit: 10, cursor: null })).map(
                    (row) => row.id,
                ),
            ).toEqual([ids[1], ids[2]]);
        }));
    it('excludes trash and changed sources and removes records on permanent deletion', async () =>
        database.rollback(async (tx) => {
            const repo = await fixture(tx);
            await tx.media.update({ where: { id: ids[0] }, data: { deletedAt: new Date() } });
            await tx.media.update({ where: { id: ids[1] }, data: { checksum: 'b'.repeat(64) } });
            expect(await repo.search({ profile, vector: [1, 0], excludeId: null, limit: 10, cursor: null })).toEqual([
                { id: ids[2], score: 0 },
            ]);
            expect(
                await repo.save({
                    mediaId: ids[1],
                    ...profile,
                    sourceChecksum: checksum,
                    vector: [1, 0],
                    tags: [],
                    tagRevision: 'none',
                    status: 'READY',
                }),
            ).toBe(false);
            expect(await repo.loadSource(ids[0])).toBeNull();
            await tx.mediaVariant.deleteMany({ where: { mediaId: ids[2] } });
            await tx.media.delete({ where: { id: ids[2] } });
            expect(await tx.semanticIndex.count({ where: { mediaId: ids[2] } })).toBe(0);
        }));
    it('does not let a duplicate failed attempt erase a completed record', async () =>
        database.rollback(async (tx) => {
            const repo = await fixture(tx);
            await repo.fail({ mediaId: ids[0], ...profile, sourceChecksum: checksum, tagRevision: 'none' });
            expect((await repo.getIndex(ids[0], profile)).status).toBe('READY');
        }));
    it('prioritizes fresh candidates over eligible failures so retries cannot starve backfill', async () =>
        database.rollback(async (tx) => {
            const repo = await fixture(tx);
            await tx.semanticIndex.deleteMany({ where: { mediaId: { in: ids.slice(0, 2) } } });
            await repo.fail({ mediaId: ids[0], ...profile, sourceChecksum: checksum, tagRevision: 'none' });
            const candidates = await repo.findCandidates({
                ...profile,
                tagRevision: 'none',
                limit: 1,
                retryBefore: new Date(Date.now() + 1000),
            });
            expect(candidates).toEqual([ids[1]]);
        }));
    it('reconciles new, changed and failed records with a retry delay', async () =>
        database.rollback(async (tx) => {
            const repo = await fixture(tx);
            await tx.semanticIndex.deleteMany({ where: { mediaId: ids[0] } });
            await tx.semanticIndex.deleteMany({ where: { mediaId: ids[1] } });
            await repo.fail({ mediaId: ids[1], ...profile, sourceChecksum: checksum, tagRevision: 'none' });
            const options = { ...profile, tagRevision: 'none', limit: 50, retryBefore: new Date(Date.now() - 300000) };
            expect(await repo.findCandidates(options)).toEqual([ids[0]]);
            await tx.semanticIndex.update({
                where: { mediaId_space: { mediaId: ids[1], space: profile.space } },
                data: { updatedAt: new Date(Date.now() - 600000) },
            });
            expect(await repo.findCandidates(options)).toEqual([ids[0], ids[1]]);
        }));
});
