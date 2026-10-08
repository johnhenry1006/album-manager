import { createTaxonomyAssignmentRepository } from './taxonomyAssignment.repository.js';

export function createTaxonomyRepository(client, kind, { inTransaction = typeof client.$connect !== 'function' } = {}) {
    const categories = kind === 'categories';
    const model = categories ? client.category : client.tag;
    const select = {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        ...(categories ? { parentId: true } : {}),
    };
    const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
    const repository = {
        async transaction(run, { readOnly = false } = {}) {
            if (!inTransaction)
                return client.$transaction((tx) => run(createTaxonomyRepository(tx, kind, { inTransaction: true })), {
                    isolationLevel: readOnly ? 'RepeatableRead' : 'ReadCommitted',
                });
            await client.$executeRaw`SAVEPOINT taxonomy_domain_write`;
            try {
                const result = await run(repository);
                await client.$executeRaw`RELEASE SAVEPOINT taxonomy_domain_write`;
                return result;
            } catch (error) {
                await client.$executeRaw`ROLLBACK TO SAVEPOINT taxonomy_domain_write`;
                await client.$executeRaw`RELEASE SAVEPOINT taxonomy_domain_write`;
                throw error;
            }
        },
        async lock() {
            // Table-level serialization covers parent validation and deletion, including
            // external writers. The next ReadCommitted statement sees committed changes.
            if (categories) await client.$executeRaw`LOCK TABLE categories IN SHARE ROW EXCLUSIVE MODE`;
            else await client.$executeRaw`LOCK TABLE tags IN SHARE ROW EXCLUSIVE MODE`;
        },
        find: (id) => model.findUnique({ where: { id }, select }),
        children: (parentId) => client.category.count({ where: { parentId } }),
        create: (data) => model.create({ data, select }),
        update: (id, data) => model.update({ where: { id }, data, select }),
        remove: (id) => model.delete({ where: { id } }),
        list({ page, limit, q }) {
            const where =
                q === undefined ? {} : { name: { contains: q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } };
            return repository.transaction(
                async (tx) => {
                    const [rows, total] = await Promise.all([tx.page(where, page, limit), tx.count(where)]);
                    return { rows, total };
                },
                { readOnly: true },
            );
        },
        page: (where, page, limit) => model.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, select }),
        count: (where) => model.count({ where }),
        treeRows: () => repository.transaction((tx) => tx.findTreeRows(), { readOnly: true }),
        findTreeRows: () => client.category.findMany({ select, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
        ...createTaxonomyAssignmentRepository(client, kind),
    };
    return Object.freeze(repository);
}
