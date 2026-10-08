// Application/worker composition supplies its owned Prisma or transaction client.
export function createApplicationSettingsRepository(client) {
    return Object.freeze({
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
