import { invalidUpload, uploadNotFound } from '../services/upload.errors.js';

export function createUploadRepository(client) {
    return Object.freeze({
        createSession() {
            return client.uploadSession.create({ data: {} });
        },
        findSession(id) {
            return client.uploadSession.findUnique({ where: { id } });
        },
        updateSession(id, data) {
            return client.uploadSession.update({ where: { id }, data });
        },
        countFiles(uploadSessionId) {
            return client.uploadFile.count({ where: { uploadSessionId } });
        },
        createFile(data) {
            return client.uploadFile.create({ data });
        },
        findFile(id) {
            return client.uploadFile.findUnique({ where: { id } });
        },
        updateFile(id, data) {
            return client.uploadFile.update({ where: { id }, data });
        },
        async listFiles(uploadSessionId, { limit, cursor }) {
            if (
                cursor &&
                !(await client.uploadFile.findFirst({ where: { id: cursor, uploadSessionId }, select: { id: true } }))
            )
                throw invalidUpload('Invalid upload cursor');
            return client.uploadFile.findMany({
                where: { uploadSessionId },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: limit + 1,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
        },
        async fileStatuses(uploadSessionId) {
            const groups = await client.uploadFile.groupBy({ by: ['status'], where: { uploadSessionId } });
            return groups.map((group) => group.status);
        },
        withSessionLock(id, run) {
            return client.$transaction(
                async (transaction) => {
                    const rows =
                        await transaction.$queryRaw`SELECT id FROM upload_sessions WHERE id = ${id}::uuid FOR UPDATE`;
                    if (!rows.length) throw uploadNotFound();
                    return run(transaction);
                },
                { timeout: 30000 },
            );
        },
        withFileLock(id, run) {
            return client.$transaction(
                async (transaction) => {
                    // Lock session first, matching registration and preventing aggregation races.
                    const file = await transaction.uploadFile.findUnique({
                        where: { id },
                        select: { uploadSessionId: true },
                    });
                    if (!file) throw uploadNotFound();
                    await transaction.$queryRaw`SELECT id FROM upload_sessions WHERE id = ${file.uploadSessionId}::uuid FOR UPDATE`;
                    const rows =
                        await transaction.$queryRaw`SELECT id FROM upload_files WHERE id = ${id}::uuid FOR UPDATE`;
                    if (!rows.length) throw uploadNotFound();
                    return run(transaction);
                },
                { timeout: 30000 },
            );
        },
    });
}
