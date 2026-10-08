import { generatedSlug } from '#shared/utils/generatedSlug.js';

import { mapTaxonomy } from '../mappers/taxonomy.mapper.js';
import { validateId, validateList, validateTaxonomy } from '../validators/taxonomy.validator.js';
import { buildCategoryTree, requireLeaf, validateParent } from './categoryHierarchy.service.js';
import { notFound, taxonomyWrite } from './taxonomy.errors.js';
import { createTaxonomyAssignments } from './taxonomyAssignments.service.js';

export function createTaxonomyService({ repository, kind }) {
    const hierarchical = kind === 'categories';
    async function requireItem(tx, id) {
        const item = await tx.find(id);
        if (!item) throw notFound(kind);
        return item;
    }
    return Object.freeze({
        async list(input) {
            const query = validateList(input, kind);
            if (query.tree) {
                const rows = await repository.treeRows();
                return { items: buildCategoryTree(rows.map(mapTaxonomy)) };
            }
            const { rows, total } = await repository.list(query);
            return {
                items: rows.map(mapTaxonomy),
                pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
            };
        },
        async create(input) {
            const data = validateTaxonomy(input, kind, { create: true });
            data.slug ??= generatedSlug(data.name, 'taxonomy');
            return taxonomyWrite(() =>
                repository.transaction(async (tx) => {
                    await tx.lock();
                    if (hierarchical) await validateParent(tx, null, data.parentId);
                    return mapTaxonomy(await tx.create(data));
                }),
            );
        },
        async update(id, input) {
            id = validateId(id);
            const data = validateTaxonomy(input, kind);
            return taxonomyWrite(() =>
                repository.transaction(async (tx) => {
                    await tx.lock();
                    await requireItem(tx, id);
                    if (hierarchical && Object.hasOwn(data, 'parentId')) await validateParent(tx, id, data.parentId);
                    return mapTaxonomy(await tx.update(id, data));
                }),
            );
        },
        async remove(id) {
            id = validateId(id);
            await taxonomyWrite(() =>
                repository.transaction(async (tx) => {
                    await tx.lock();
                    await requireItem(tx, id);
                    if (hierarchical) await requireLeaf(tx, id);
                    await tx.remove(id);
                }),
            );
        },
        ...createTaxonomyAssignments({ repository, kind }),
    });
}
