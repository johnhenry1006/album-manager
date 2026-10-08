import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workspaces = ['apps/web', 'apps/api', 'packages/shared'];
const requiredDirectories = [
    'infrastructure/docker',
    'infrastructure/scripts',
    'docs/architecture',
    'docs/database',
    'docs/api',
    'packages/shared/src',
    ...[
        'app/router',
        'app/providers',
        'app/layouts',
        'pages',
        'features',
        'components/ui',
        'components/common',
        'components/media',
        'components/layout',
        'hooks',
        'services',
        'store',
        'utils',
        'constants',
        'config',
        'styles',
        'test',
    ].map((directory) => `apps/web/src/${directory}`),
    ...[
        'app',
        'config',
        'modules',
        'infrastructure/database',
        'infrastructure/storage',
        'infrastructure/queue',
        'infrastructure/cache',
        'infrastructure/image-processing',
        'shared/errors',
        'shared/middleware',
        'shared/validation',
        'shared/utils',
        'shared/constants',
        'jobs',
    ].map((directory) => `apps/api/src/${directory}`),
];
const requiredFiles = [
    'README.md',
    '.editorconfig',
    '.gitignore',
    '.env.example',
    'docker-compose.yml',
    ...['ARCHITECTURE_RULES', 'FRONTEND_STRUCTURE', 'BACKEND_STRUCTURE'].map((name) => `docs/architecture/${name}.md`),
];
const skippedDirectories = new Set([
    '.git',
    '.agents',
    '.codex',
    '.aws',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.cache',
]);

async function readManifest(relativePath) {
    const manifest = JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
    assert.equal(manifest.private, true, `${relativePath} must be private`);
    assert.equal(manifest.type, 'module', `${relativePath} must use ES modules`);
    return manifest;
}

async function checkJavaScriptOnly(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const location = path.join(directory, entry.name);
        if (entry.isDirectory() && !skippedDirectories.has(entry.name)) {
            await checkJavaScriptOnly(location);
        } else if (entry.isFile()) {
            assert.ok(!/\.(?:ts|tsx|mts|cts)$/i.test(entry.name), `TypeScript file: ${location}`);
            assert.ok(!/^tsconfig(?:\..+)?\.json$/i.test(entry.name), `TypeScript config: ${location}`);
            if (entry.name === 'package.json') {
                const manifest = JSON.parse(await readFile(location, 'utf8'));
                for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
                    for (const dependency of Object.keys(manifest[field] ?? {})) {
                        assert.ok(
                            !/typescript|^ts-node$|^tsx$|^@types\//i.test(dependency),
                            `TypeScript dependency in ${location}: ${dependency}`,
                        );
                    }
                }
            }
        }
    }
}

const manifest = await readManifest('package.json');
assert.deepEqual(manifest.workspaces, workspaces, 'Workspaces must match the approved structure');
const names = new Set();
for (const workspace of workspaces) {
    const workspaceManifest = await readManifest(`${workspace}/package.json`);
    assert.ok(workspaceManifest.name, `${workspace} needs a package name`);
    assert.ok(!names.has(workspaceManifest.name), 'Workspace names must be unique');
    names.add(workspaceManifest.name);
}
for (const directory of requiredDirectories) {
    assert.ok((await stat(path.join(root, directory))).isDirectory(), `Missing directory: ${directory}`);
}
for (const file of requiredFiles) {
    assert.ok((await stat(path.join(root, file))).isFile(), `Missing file: ${file}`);
}
const rules = await readFile(path.join(root, 'docs/architecture/ARCHITECTURE_RULES.md'), 'utf8');
const ruleNumbers = [...rules.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1]));
assert.deepEqual(
    ruleNumbers,
    Array.from({ length: 40 }, (_, index) => index + 1),
    'Architecture rules must contain mandatory rules 1–40 in order',
);
await checkJavaScriptOnly(root);
console.log('Foundation verified: 3 npm workspaces, required scaffold, 40 rules, no TypeScript.');
