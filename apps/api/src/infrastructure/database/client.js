import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Construction owns a pool but opens no connection until connect/query is called.
export function createPrismaClient({ databaseUrl }, { schema } = {}) {
    return new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 }, { schema }),
        errorFormat: 'minimal',
        log: [],
    });
}
