// Transaction clients can expose nested $transaction, but do not own $connect.
// Recover PostgreSQL constraint failures before querying or returning a domain error.
export async function mediaWrite(client, operation) {
    const transactional = typeof client.$connect !== 'function' && typeof client.$executeRaw === 'function';
    if (transactional) await client.$executeRaw`SAVEPOINT media_domain_write`;
    try {
        const result = await operation();
        if (transactional) await client.$executeRaw`RELEASE SAVEPOINT media_domain_write`;
        return result;
    } catch (error) {
        if (transactional) {
            await client.$executeRaw`ROLLBACK TO SAVEPOINT media_domain_write`;
            await client.$executeRaw`RELEASE SAVEPOINT media_domain_write`;
        }
        throw error;
    }
}
