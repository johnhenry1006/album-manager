import { authError } from '../services/auth.errors.js';
export const LEGACY_OWNER_ID = '00000000-0000-4000-8000-000000000001';
const USER_SELECT = { id: true, email: true, passwordHash: true };
export function createAuthRepository(client) {
    return Object.freeze({
        findUserByEmail(email) {
            return client.user.findUnique({ where: { email }, select: USER_SELECT });
        },
        createSession(data) {
            return client.authSession.create({ data, select: { id: true } });
        },
        findSession(tokenHash, now) {
            return client.authSession.findFirst({
                where: { tokenHash, expiresAt: { gt: now } },
                select: { id: true, csrfToken: true, user: { select: USER_SELECT } },
            });
        },
        deleteSession(tokenHash) {
            return client.authSession.deleteMany({ where: { tokenHash } });
        },
        async deleteExpiredSessions(now, limit) {
            const rows = await client.authSession.findMany({
                where: { expiresAt: { lte: now } },
                orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length)
                await client.authSession.deleteMany({
                    where: { id: { in: rows.map(({ id }) => id) }, expiresAt: { lte: now } },
                });
        },
        async provisionUser(data) {
            try {
                return await client.$transaction(async (tx) => {
                    // Serialize provisioning across transactions without relying on a raw table search path.
                    await tx.$queryRaw`SELECT pg_advisory_xact_lock(10961009)::text`;
                    const owner = await tx.user.findUnique({ where: { id: LEGACY_OWNER_ID }, select: USER_SELECT });
                    if (owner && owner.passwordHash === null)
                        return tx.user.update({ where: { id: LEGACY_OWNER_ID }, data, select: USER_SELECT });
                    return tx.user.create({ data, select: USER_SELECT });
                });
            } catch (error) {
                if (error.code === 'P2002') throw authError(409);
                throw error;
            }
        },
    });
}
