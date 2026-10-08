import { describe, expect, it, vi } from 'vitest';

import { createMediaRepository, createMediaVariantRepository } from '../index.js';

const id = 'a0000000-0000-4000-8000-000000000001';
const checksum = 'a'.repeat(64);

describe('media repository query contracts', () => {
    it('excludes the current media identity and soft-deleted rows from duplicate detection', async () => {
        const client = { media: { findFirst: vi.fn() } };
        await createMediaRepository(client).findByChecksum(checksum, { excludeMediaId: id });
        expect(client.media.findFirst).toHaveBeenCalledWith({
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            where: { checksum, deletedAt: null, id: { not: id } },
        });
    });
    it('filters soft-deleted rows on normal reads and writes', async () => {
        const client = { media: { findUnique: vi.fn(), update: vi.fn() } };
        const repository = createMediaRepository(client);
        await repository.findById(id);
        await repository.update(id, { status: 'PROCESSING' });
        expect(client.media.findUnique).toHaveBeenCalledWith({ where: { id, deletedAt: null } });
        expect(client.media.update).toHaveBeenCalledWith({
            where: { id, deletedAt: null },
            data: { status: 'PROCESSING' },
        });
    });
    it('looks up reserved checksums explicitly including deleted records', async () => {
        const client = { media: { findFirst: vi.fn() } };
        await createMediaRepository(client).findByChecksum(checksum, { includeDeleted: true });
        expect(client.media.findFirst).toHaveBeenCalledWith({
            where: { checksum },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
    });
    it('permits explicitly accepted duplicate checksums without a uniqueness lookup', async () => {
        const client = { media: { create: vi.fn(async ({ data }) => ({ id, ...data })) } };
        const repository = createMediaRepository(client);
        expect(await repository.create({ checksum })).toMatchObject({ checksum });
    });
    it('maps missing writes and unrelated uniqueness without misidentifying duplicates', async () => {
        const client = {
            media: {
                update: vi.fn().mockRejectedValue({ code: 'P2025' }),
                create: vi.fn().mockRejectedValue({ code: 'P2002' }),
            },
        };
        const repository = createMediaRepository(client);
        await expect(repository.update(id, {})).rejects.toMatchObject({ statusCode: 404 });
        await expect(repository.create({})).rejects.toMatchObject({ statusCode: 409, code: 'MEDIA_CONFLICT' });
    });
});

describe('variant repository', () => {
    it('filters variants through their live parent', async () => {
        const client = { mediaVariant: { findUnique: vi.fn(), update: vi.fn() } };
        const repository = createMediaVariantRepository(client);
        await repository.findById(id);
        await repository.update(id, { width: 50 });
        expect(client.mediaVariant.findUnique).toHaveBeenCalledWith({ where: { id, media: { deletedAt: null } } });
        expect(client.mediaVariant.update).toHaveBeenCalledWith({
            where: { id, type: { not: 'ORIGINAL' }, media: { deletedAt: null } },
            data: { width: 50 },
        });
    });
    it('locks the parent before checking originals across all formats', async () => {
        const transaction = {
            $queryRaw: vi.fn().mockResolvedValue([{ id }]),
            mediaVariant: { findFirst: vi.fn().mockResolvedValue({ id, format: 'jpeg' }), create: vi.fn() },
        };
        const client = { $transaction: (run) => run(transaction) };
        await expect(
            createMediaVariantRepository(client).createOriginal({ mediaId: id, type: 'ORIGINAL', format: 'png' }),
        ).rejects.toMatchObject({ code: 'ORIGINAL_EXISTS', statusCode: 409 });
        expect(transaction.mediaVariant.findFirst).toHaveBeenCalledWith({ where: { mediaId: id, type: 'ORIGINAL' } });
        expect(transaction.mediaVariant.create).not.toHaveBeenCalled();
        expect(transaction.$queryRaw).toHaveBeenCalled();
    });
    it('registers an original using an already supplied transaction client', async () => {
        const data = { mediaId: id, type: 'ORIGINAL', format: 'jpeg' };
        const client = {
            $queryRaw: vi.fn().mockResolvedValue([{ id }]),
            mediaVariant: {
                findFirst: vi.fn().mockResolvedValue(null),
                create: vi.fn().mockResolvedValue({ id, ...data }),
            },
        };
        expect(await createMediaVariantRepository(client).createOriginal(data)).toMatchObject({ id, format: 'jpeg' });
    });
});

describe('transaction write conflict recovery', () => {
    it('recovers an aborted write before continuing the caller transaction', async () => {
        let aborted = false;
        const client = {
            // Prisma 7 transaction clients can expose nested $transaction too.
            $transaction: vi.fn(),
            $executeRaw: vi.fn(async (sql) => {
                if (sql[0].includes('ROLLBACK')) aborted = false;
            }),
            media: {
                create: vi.fn(async () => {
                    aborted = true;
                    throw { code: 'P2002' };
                }),
                findUnique: vi.fn(async () => {
                    if (aborted) throw new Error('Transaction aborted');
                    return { id, checksum };
                }),
            },
        };
        await expect(createMediaRepository(client).create({ checksum })).rejects.toMatchObject({
            code: 'MEDIA_CONFLICT',
        });
        expect(await createMediaRepository(client).findById(id)).toMatchObject({ id, checksum });
    });
});

describe('variant transaction and live-parent guarantees', () => {
    it('recovers a failed variant update before continuing the caller transaction', async () => {
        let aborted = false;
        const client = {
            $transaction: vi.fn(),
            $executeRaw: vi.fn(async (sql) => {
                if (sql[0].includes('ROLLBACK')) aborted = false;
            }),
            mediaVariant: {
                update: vi.fn(async () => {
                    aborted = true;
                    throw { code: 'P2002' };
                }),
                findUnique: vi.fn(async () => {
                    if (aborted) throw new Error('Transaction aborted');
                    return { id };
                }),
            },
        };
        const repository = createMediaVariantRepository(client);
        await expect(repository.update(id, { storageKey: 'duplicate' })).rejects.toMatchObject({
            code: 'VARIANT_CONFLICT',
        });
        expect(await repository.findById(id)).toEqual({ id });
    });
    it('rejects derivative registration if its parent was deleted after validation', async () => {
        const transaction = { $queryRaw: vi.fn().mockResolvedValue([]), mediaVariant: { create: vi.fn() } };
        const client = { $transaction: (run) => run(transaction) };
        await expect(
            createMediaVariantRepository(client).create({ mediaId: id, type: 'THUMBNAIL' }),
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(transaction.mediaVariant.create).not.toHaveBeenCalled();
    });
});
