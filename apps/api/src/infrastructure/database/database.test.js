import { describe, expect, it, vi } from 'vitest';

import { createDatabase } from './database.js';
import { checkDatabaseHealth } from './health.js';

function fakeClient() {
    return {
        $connect: vi.fn().mockResolvedValue(),
        $disconnect: vi.fn().mockResolvedValue(),
        $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
    };
}

describe('database lifecycle', () => {
    it('shares a client and connects/disconnects once across concurrent callers', async () => {
        const client = fakeClient();
        const database = createDatabase({}, { client });
        expect(database.client).toBe(client);
        await Promise.all([database.connect(), database.connect()]);
        await Promise.all([database.disconnect(), database.disconnect()]);
        expect(client.$connect).toHaveBeenCalledTimes(1);
        expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('cleans up failed connections and hides connection details', async () => {
        const client = fakeClient();
        client.$connect.mockRejectedValue(new Error('postgresql://private:password@host/app'));
        const database = createDatabase({}, { client });
        await expect(database.connect()).rejects.toThrow('Database connection failed');
        await database.disconnect();
        expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('propagates disconnect failures as a safe error', async () => {
        const client = fakeClient();
        client.$disconnect.mockRejectedValue(new Error('private'));
        await expect(createDatabase({}, { client }).disconnect()).rejects.toThrow('Database disconnection failed');
    });

    it('requires a successful query before considering the connection ready', async () => {
        const client = fakeClient();
        client.$queryRaw.mockRejectedValue(new Error('connection refused'));
        const database = createDatabase({}, { client });
        await expect(database.connect()).rejects.toThrow('Database connection failed');
        expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });
});

describe('database health', () => {
    it('executes a parameter-safe SELECT 1 without a business schema', async () => {
        const client = { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) };
        expect(await checkDatabaseHealth(client)).toEqual({ status: 'ok' });
        expect(client.$queryRaw.mock.calls[0][0].join('')).toBe('SELECT 1');
    });

    it('returns a safe failure result', async () => {
        const client = { $queryRaw: vi.fn().mockRejectedValue(new Error('private credentials')) };
        expect(await checkDatabaseHealth(client)).toEqual({ status: 'error' });
    });
});
