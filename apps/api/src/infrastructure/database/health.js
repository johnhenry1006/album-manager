// Operational infrastructure exception to repository-only business queries.
export async function checkDatabaseHealth(client) {
    try {
        await client.$queryRaw`SELECT 1`;
        return { status: 'ok' };
    } catch {
        return { status: 'error' };
    }
}
