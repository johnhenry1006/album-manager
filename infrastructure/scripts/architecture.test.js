import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';

const root = fileURLToPath(new URL('../../', import.meta.url));
const linter = new Linter();
const isTest = (file) => /(?:\.test\.[jt]sx?$|\.testUtils\.js$|TestFixture\.js$|\/test\/)/.test(file);
const webShared = /^apps\/web\/src\/(?:components|hooks|services|utils|constants|config|store)\//;

function resolveImport(file, specifier) {
    if (specifier.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    if (specifier.startsWith('@/')) return `apps/web/src/${specifier.slice(2)}`;
    if (specifier.startsWith('#')) return `apps/api/src/${specifier.slice(1)}`;
    return null;
}

function auditSource(source, file) {
    const imports = [];
    const errors = [];
    const transportForbidden = /^apps\/web\/src\/(?:pages|components)\//.test(file) || /\/components\//.test(file);
    function inspectImport(node) {
        if (typeof node.source?.value !== 'string') return;
        const specifier = node.source.value;
        const target = resolveImport(file, specifier);
        if (!target) {
            if (transportForbidden && /^(?:axios|ky)(?:\/|$)/.test(specifier)) errors.push('Direct HTTP transport');
            return;
        }
        imports.push(target);
        if (isTest(target)) errors.push('Production imports test support');
        if (webShared.test(file) && /^apps\/web\/src\/(?:features|pages|app)\//.test(target)) {
            errors.push('Shared frontend imports application internals');
        }
        if (/^apps\/web\/src\/features\//.test(file) && /^apps\/web\/src\/pages\//.test(target)) {
            errors.push('Feature imports page');
        }
        if (
            transportForbidden &&
            (target === 'apps/web/src/services/httpClient.js' || /\/features\/[^/]+\/api\//.test(target))
        ) {
            errors.push('Direct HTTP transport');
        }
        for (const layer of ['features', 'modules']) {
            const prefix = layer === 'features' ? 'apps/web/src/' : 'apps/api/src/';
            const feature =
                target.startsWith(`${prefix}${layer}/`) && target.slice(`${prefix}${layer}/`.length).split('/')[0];
            if (
                feature &&
                !file.startsWith(`${prefix}${layer}/${feature}/`) &&
                target !== `${prefix}${layer}/${feature}/index.js`
            ) {
                errors.push('Private cross-feature import');
            }
        }
        if (
            /^apps\/api\/src\/(?:shared|infrastructure)\//.test(file) &&
            /^apps\/api\/src\/(?:modules|app|jobs)\//.test(target)
        ) {
            errors.push('Backend foundation imports application internals');
        }
        if (file.startsWith('packages/shared/') && target.startsWith('apps/'))
            errors.push('Shared package imports application');
    }
    const messages = linter.verify(
        source,
        [
            {
                files: ['**/*.{js,jsx}'],
                languageOptions: {
                    ecmaVersion: 'latest',
                    sourceType: 'module',
                    parserOptions: { ecmaFeatures: { jsx: true } },
                },
                plugins: {
                    audit: {
                        rules: {
                            imports: {
                                create: () => ({
                                    ImportDeclaration: inspectImport,
                                    ExportNamedDeclaration: inspectImport,
                                    ExportAllDeclaration: inspectImport,
                                    ImportExpression: inspectImport,
                                    CallExpression(node) {
                                        if (
                                            transportForbidden &&
                                            (node.callee.name === 'fetch' ||
                                                (node.callee.object?.name === 'globalThis' &&
                                                    node.callee.property?.name === 'fetch'))
                                        ) {
                                            errors.push('Direct HTTP transport');
                                        }
                                    },
                                    NewExpression(node) {
                                        if (transportForbidden && node.callee.name === 'XMLHttpRequest')
                                            errors.push('Direct HTTP transport');
                                    },
                                }),
                            },
                        },
                    },
                },
                rules: { 'audit/imports': 'error' },
            },
        ],
        { filename: file },
    );
    assert.ok(!messages.some((message) => message.fatal), `${file}: source must parse`);
    return { imports, errors };
}

function findCycles(graph) {
    const visited = new Set();
    const active = [];
    const cycles = [];
    function visit(file) {
        if (active.includes(file)) {
            cycles.push([...active.slice(active.indexOf(file)), file]);
            return;
        }
        if (visited.has(file)) return;
        visited.add(file);
        active.push(file);
        for (const target of graph.get(file) ?? []) visit(target);
        active.pop();
    }
    for (const file of graph.keys()) visit(file);
    return cycles;
}

async function sourceFiles(directory) {
    const files = [];
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
        const file = `${directory}/${entry.name}`;
        if (entry.isDirectory()) files.push(...(await sourceFiles(file)));
        else if (/\.(?:js|jsx)$/.test(file) && !isTest(file)) files.push(file);
    }
    return files;
}

test('architecture audit rejects forbidden imports through aliases, relative paths and re-exports', () => {
    for (const [file, source, error] of [
        ['apps/web/src/features/media/example.js', "import x from '@/pages/media/example.js';", 'Feature imports page'],
        [
            'apps/web/src/hooks/example.js',
            "export * from '../features/media/index.js';",
            'Shared frontend imports application internals',
        ],
        [
            'apps/web/src/pages/media/example.js',
            "import x from '@/features/media/api/mediaApi.js';",
            'Direct HTTP transport',
        ],
        [
            'apps/web/src/features/tag/example.js',
            "import('../media/hooks/useMedia.js');",
            'Private cross-feature import',
        ],
        [
            'apps/api/src/shared/example.js',
            "import x from '#modules/media/index.js';",
            'Backend foundation imports application internals',
        ],
        [
            'packages/shared/src/example.js',
            "export * from '../../../apps/api/src/config/database.js';",
            'Shared package imports application',
        ],
        [
            'apps/api/src/modules/media/example.js',
            "import x from './example.test.js';",
            'Production imports test support',
        ],
        [
            'apps/web/src/pages/media/example.jsx',
            'export const x = () => fetch("/api/media");',
            'Direct HTTP transport',
        ],
    ])
        assert.ok(auditSource(source, file).errors.includes(error), `${file}: ${error}`);
    assert.deepEqual(
        auditSource("export * from '@/features/media/index.js';", 'apps/web/src/features/tag/example.js').errors,
        [],
    );
});

test('cycle detection catches re-entry without flagging shared dependencies', () => {
    assert.deepEqual(
        findCycles(
            new Map([
                ['a', ['b']],
                ['b', ['a']],
            ]),
        ),
        [['a', 'b', 'a']],
    );
    assert.deepEqual(
        findCycles(
            new Map([
                ['a', ['b', 'c']],
                ['b', ['c']],
                ['c', []],
            ]),
        ),
        [],
    );
});

test('all application production imports respect boundaries and form an acyclic resolved graph', async () => {
    const files = (await Promise.all(['apps/web/src', 'apps/api/src', 'packages/shared/src'].map(sourceFiles))).flat();
    const graph = new Map();
    const failures = [];
    for (const file of files) {
        const { imports, errors } = auditSource(await readFile(path.join(root, file), 'utf8'), file);
        graph.set(
            file,
            imports.filter((target) => /\.(?:js|jsx)$/.test(target)),
        );
        failures.push(...errors.map((error) => `${file}: ${error}`));
        for (const target of imports) {
            try {
                await readFile(path.join(root, target));
            } catch {
                failures.push(`${file}: unresolved ${target}`);
            }
        }
    }
    assert.deepEqual(failures, []);
    assert.deepEqual(findCycles(graph), []);
});
