import { describe, expect, it, vi } from 'vitest';

import { createTaxonomyAssignmentRepository } from './taxonomyAssignment.repository.js';

const ids = [1, 2, 3].map((n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);

describe.each(['categories', 'tags'])('%s assignment query budget', (kind) => {
    it('locks a batch in one parameterized statement with deterministic ordering', async () => {
        const statements = [];
        const client = {
            $queryRaw: async (sql, ...parameters) => {
                statements.push({ sql: sql.join('?'), parameters });
                const requested = Array.isArray(parameters[0]) ? parameters[0] : parameters;
                return requested.filter((id) => ids.slice(0, 2).includes(id)).map((id) => ({ id }));
            },
        };
        const repository = createTaxonomyAssignmentRepository(client, kind);
        expect(await repository.lockMedia(ids)).toEqual(ids.slice(0, 2));
        expect(statements).toHaveLength(1);
        expect(statements[0].parameters).toEqual([ids]);
        expect(statements[0].sql).toMatch(/deleted_at IS NULL/u);
        expect(statements[0].sql).toMatch(/ORDER BY id FOR UPDATE/u);
    });

    it('validates all taxonomy IDs with one ID-only lookup', async () => {
        const query = vi.fn(async () => [{ id: ids[0] }, { id: ids[1] }]);
        const client = { category: { findMany: query }, tag: { findMany: query } };
        const repository = createTaxonomyAssignmentRepository(client, kind);
        expect(await repository.findEntityIds(ids)).toEqual(ids.slice(0, 2));
        expect(query).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ids } }, select: { id: true } });
    });
});
