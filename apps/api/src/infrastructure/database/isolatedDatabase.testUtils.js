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
            for (const migration of await readTestMigrations()) {
                await admin.query('BEGIN');
                try {
                    await admin.query(`SET LOCAL search_path TO "${schema}"`);
                    await admin.query(migration);
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
        async withClient(run) {
            return run(client, schema);
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

// Keep all PostgreSQL test harnesses aligned with the generated Prisma client.
export async function readTestMigrations() {
    const root = new URL('../../../prisma/migrations/', import.meta.url);
    const statements = [];
    const directories = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const directory of directories) {
        if ((await readdir(new URL(`${directory.name}/`, root))).includes('migration.sql'))
            statements.push(await readFile(new URL(`${directory.name}/migration.sql`, root), 'utf8'));
    }
    return statements;
}
