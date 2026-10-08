export function mapMediaTrashItem(record, gallery) {
    return {
        ...gallery,
        deletedAt: record.deletedAt.toISOString(),
        purgeStartedAt: record.purgeStartedAt?.toISOString() ?? null,
        canRestore: !record.purgeStartedAt,
    };
}
