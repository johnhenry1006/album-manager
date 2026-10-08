import { defineConfig } from 'prisma/config';

import { validateDatabaseEnvironment } from './src/config/database.js';
import { loadEnvironment } from './src/config/loadConfig.js';

const environment = loadEnvironment();
// Generation must work without database credentials or a running PostgreSQL.
const databaseUrl =
    environment.DATABASE_URL !== undefined || environment.POSTGRES_PASSWORD
        ? validateDatabaseEnvironment(environment).databaseUrl
        : undefined;

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
    datasource: { url: databaseUrl },
});
