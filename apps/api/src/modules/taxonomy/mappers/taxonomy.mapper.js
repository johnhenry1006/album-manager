export function mapTaxonomy(row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        ...(Object.hasOwn(row, 'parentId') ? { parentId: row.parentId } : {}),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}
