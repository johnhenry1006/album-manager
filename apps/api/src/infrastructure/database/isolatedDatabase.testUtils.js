import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

import pg from 'pg';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';

import { createPrismaClient } from './client.js';

// Test-only lifecycle: random schema, reviewed migrations, rollback per fixture.
export function createIsolatedTestDatabase() {
    const schema = `media_test_${randomUUID().replaceAll('-', '')}`;
    let admin;
    let client;
    let schemaCreated = false;
    return Object.freeze({
        async open() {
            const config = validateDatabaseEnvironment(loadEnvironment());
            admin = new pg.Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 });
            await admin.connect();
            await admin.query(`CREATE SCHEMA "${schema}"`);
            schemaCreated = true;
            const migrations = new URL('../../../prisma/migrations/', import.meta.url);
            for (const directory of (await readdir(migrations, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory())
                .sort((a, b) => a.name.localeCompare(b.name))) {
                if (!(await readdir(new URL(`${directory.name}/`, migrations))).includes('migration.sql')) continue;
                await admin.query('BEGIN');
                try {
                    await admin.query(`SET LOCAL search_path TO "${schema}"`);
                    await admin.query(await readFile(new URL(`${directory.name}/migration.sql`, migrations), 'utf8'));
                    await admin.query('COMMIT');
                } catch (error) {
                    await admin.query('ROLLBACK');
                    throw error;
                }
            }
            client = createPrismaClient(config, { schema });
            await client.$connect();
        },
        async close() {
            try {
                await client?.$disconnect();
                if (schemaCreated) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            } finally {
                await admin?.end();
            }
        },
        async rollback(run) {
            const marker = new Error('Rollback test fixture');
            try {
                await client.$transaction(
                    async (tx) => {
                        await tx.$queryRaw`SELECT set_config('search_path', ${schema}, true)`;
                        await run(tx);
                        throw marker;
                    },
                    { timeout: 15000 },
                );
            } catch (error) {
                if (error !== marker) throw error;
            }
        },
    });
}
