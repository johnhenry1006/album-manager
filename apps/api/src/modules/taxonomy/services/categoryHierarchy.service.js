import { invalid, notFound, taxonomyError } from './taxonomy.errors.js';

export async function validateParent(repository, id, parentId) {
    const seen = new Set(id ? [id] : []);
    let ancestor = parentId;
    while (ancestor !== null && ancestor !== undefined) {
        if (seen.has(ancestor)) throw invalid('Category parent would create a cycle');
        seen.add(ancestor);
        const parent = await repository.find(ancestor);
        if (!parent) throw notFound('Parent category');
        ancestor = parent.parentId;
    }
}

export async function requireLeaf(repository, id) {
    if (await repository.children(id)) throw taxonomyError(409, 'Remove or reparent children first');
}

export function buildCategoryTree(rows) {
    const nodes = new Map(rows.map((row) => [row.id, { ...row, children: [] }]));
    const roots = [];
    for (const node of nodes.values()) {
        if (node.parentId === null) roots.push(node);
        else {
            const parent = nodes.get(node.parentId);
            if (!parent) throw taxonomyError(500, 'Invalid persisted category hierarchy');
            parent.children.push(node);
        }
    }
    // Guard persisted corruption and cyclic object responses without recursion/depth limits.
    let visited = 0;
    const stack = [...roots];
    while (stack.length) {
        const node = stack.pop();
        visited++;
        stack.push(...node.children);
    }
    if (visited !== nodes.size) throw taxonomyError(500, 'Invalid persisted category hierarchy');
    return roots;
}
