import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';
import { checkDatabaseHealth, createDatabase } from '#infrastructure/database/index.js';

async function main() {
    const database = createDatabase(validateDatabaseEnvironment(loadEnvironment()));
    try {
        await database.connect();
        if ((await checkDatabaseHealth(database.client)).status !== 'ok') {
            throw new Error('Database health check failed');
        }
        // Future seeds call repository factories with database.client and use idempotent upserts.
        console.log('Seed foundation ready; no business data defined.');
    } finally {
        await database.disconnect();
    }
}

main().catch(() => {
    console.error('Database seed failed. Check database configuration and availability.');
    process.exitCode = 1;
});
