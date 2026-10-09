// Composition supplies its owned Prisma client; lock callbacks receive a transaction-scoped repository.
export function createApplicationSettingsRepository(client) {
    return Object.freeze({
        withSettingsLock(key, run) {
            return client.$transaction(async (transaction) => {
                // Lock by key, including when the row has not yet been created.
                await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
                return run(createApplicationSettingsRepository(transaction));
            });
        },
        findByKey(key) {
            return client.applicationSetting.findUnique({ where: { key }, select: { key: true, value: true } });
        },
        upsert(key, value) {
            return client.applicationSetting.upsert({
                where: { key },
                create: { key, value },
                update: { value },
                select: { key: true, value: true },
            });
        },
    });
}
