import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('local environment setup generates private secrets and preserves existing configuration', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'album-manager-env-test-'));
    try {
        const scripts = path.join(directory, 'infrastructure/scripts');
        await mkdir(scripts, { recursive: true });
        const script = path.join(scripts, 'setup-local-env.mjs');
        await copyFile(new URL('./setup-local-env.js', import.meta.url), script);
        await copyFile(new URL('../../.env.example', import.meta.url), path.join(directory, '.env.example'));
        const generated = spawnSync(process.execPath, [script], { encoding: 'utf8' });
        assert.equal(generated.status, 0, generated.stderr);
        const envFile = path.join(directory, '.env');
        const content = await readFile(envFile, 'utf8');
        const secrets = ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'].map(
            (name) => content.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1],
        );
        assert.equal(new Set(secrets).size, 4);
        for (const secret of secrets) {
            assert.match(secret, /^[a-f0-9]{48}$/);
            assert.ok(!generated.stdout.includes(secret));
            assert.ok(!generated.stderr.includes(secret));
        }
        if (process.platform !== 'win32') assert.equal((await stat(envFile)).mode & 0o777, 0o600);
        const repeated = spawnSync(process.execPath, [script], { encoding: 'utf8' });
        assert.equal(repeated.status, 1);
        assert.match(repeated.stderr, /already exists; preserved it/);
        assert.equal(await readFile(envFile, 'utf8'), content);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
