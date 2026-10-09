export function validateTrashEnvironment(environment) {
    const value = environment.TRASH_RETENTION_DAYS ?? '30';
    if (
        typeof value !== 'string' ||
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < 1 ||
        Number(value) > 36500
    )
        throw new Error('Invalid trash configuration: TRASH_RETENTION_DAYS');
    return Object.freeze({ retentionDays: Number(value) });
}
