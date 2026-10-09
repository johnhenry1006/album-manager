import { expect, it, vi } from 'vitest';

import { createMediaTrashRepository } from './mediaTrash.repository.js';
it('uses the same stable ordering and cursor comparison for retention pages', async () => {
    const findMany = vi.fn(async () => []);
    const repository = createMediaTrashRepository({ media: { findMany } });
    const before = new Date('2026-09-09T00:00:00Z');
    const after = { deletedAt: new Date('2026-09-01T00:00:00Z'), id: 'c0000000-0000-4000-8000-000000000001' };
    await repository.expired({ before, limit: 50, after });
    expect(findMany).toHaveBeenCalledWith({
        where: {
            deletedAt: { lte: before },
            OR: [{ deletedAt: { gt: after.deletedAt } }, { deletedAt: after.deletedAt, id: { gt: after.id } }],
        },
        select: { id: true, deletedAt: true },
        orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
        take: 50,
    });
});
