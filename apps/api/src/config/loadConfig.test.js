import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { loadConfig } from './loadConfig.js';

const directories = [];
afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it('loads dotenv values but preserves supplied process settings', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'album-manager-api-config-'));
    directories.push(directory);
    const envFile = path.join(directory, '.env');
    await writeFile(envFile, 'API_PORT=4100\nAPI_HOST=localhost\nLOG_LEVEL=warn\n');
    const config = loadConfig({ envFile, environment: { API_PORT: '4200' } });
    expect(config).toMatchObject({ port: 4200, host: 'localhost', logLevel: 'warn' });
});

it('works from explicit environment values when no local dotenv file exists', () => {
    const config = loadConfig({ envFile: '/missing-album-manager-env/.env', environment: { NODE_ENV: 'production' } });
    expect(config.nodeEnv).toBe('production');
});

it('validates values loaded from the dotenv file before startup', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'album-manager-api-config-'));
    directories.push(directory);
    const envFile = path.join(directory, '.env');
    await writeFile(envFile, 'API_PORT=invalid\n');
    expect(() => loadConfig({ envFile, environment: {} })).toThrow(/API_PORT/);
});
