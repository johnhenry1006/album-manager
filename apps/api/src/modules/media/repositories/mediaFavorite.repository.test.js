import { describe, expect, it, vi } from 'vitest';

import { createMediaFavoriteRepository } from './mediaFavorite.repository.js';

const id = 'a0000000-0000-4000-8000-000000000001';

describe('favorite persistence boundary', () => {
    it('uses the transaction client, locks live media and writes conflict-safe personal rows', async () => {
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([{ id }]),
            favorite: { createMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn() },
        };
        const client = { $connect() {}, $transaction: vi.fn((run) => run(tx)) };
        const repository = createMediaFavoriteRepository(client);
        await repository.transaction(async (scoped) => {
            expect(await scoped.lockMedia(id)).toEqual({ id });
            await scoped.add(id, '00000000-0000-4000-8000-000000000001');
            await scoped.remove(id, '00000000-0000-4000-8000-000000000001');
        });
        const [strings, value] = tx.$queryRaw.mock.calls[0];
        expect(strings.join('?')).toBe('SELECT id FROM media WHERE id = ?::uuid AND deleted_at IS NULL FOR UPDATE');
        expect(value).toBe(id);
        expect(tx.favorite.createMany).toHaveBeenCalledWith({
            data: { mediaId: id, userId: '00000000-0000-4000-8000-000000000001' },
            skipDuplicates: true,
        });
        expect(tx.favorite.deleteMany).toHaveBeenCalledWith({
            where: { mediaId: id, userId: '00000000-0000-4000-8000-000000000001' },
        });
        expect(client.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'ReadCommitted' });
    });

    it('supports an injected transaction and reports missing live media', async () => {
        const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
        const repository = createMediaFavoriteRepository(tx);
        expect(await repository.transaction((scoped) => scoped.lockMedia(id))).toBeNull();
    });
});
