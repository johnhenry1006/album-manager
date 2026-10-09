// Shared thumbnail-only projection for compact collections.
export const mediaThumbnailQuery = {
    where: { type: 'THUMBNAIL' },
    orderBy: [{ width: 'asc' }, { id: 'asc' }],
    select: { name: true, format: true, width: true, height: true, storageKey: true },
};
