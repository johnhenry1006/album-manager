import { createPrismaClient } from './client.js';

// One owner per API/worker/script. Inject client into repositories at composition.
export function createDatabase(config, { client = createPrismaClient(config) } = {}) {
    let connection;
    let disconnection;
    function disconnect() {
        disconnection ??= client.$disconnect().catch(() => {
            throw new Error('Database disconnection failed');
        });
        return disconnection;
    }
    function connect() {
        connection ??= client
            .$connect()
            .then(async () => {
                // Driver-adapter initialization alone does not prove database availability.
                await client.$queryRaw`SELECT 1`;
            })
            .catch(async () => {
                await disconnect().catch(() => {});
                throw new Error('Database connection failed');
            });
        return connection;
    }
    return Object.freeze({ client, connect, disconnect });
}
