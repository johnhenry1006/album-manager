import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { resolveConfig } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

async function lint(source, filePath) {
    const [result] = await eslint.lintText(source, { filePath });
    assert.ok(!result.messages.some((message) => message.fatal), 'Fixture must parse successfully');
    return result.messages.map((message) => message.ruleId);
}

test('unused imports are errors', async () => {
    const rules = await lint(
        "import unused from './unused.js';\nexport const value = 1;",
        'apps/web/src/utils/example.js',
    );
    assert.ok(rules.includes('unused-imports/no-unused-imports'));
});

test('import ordering is checked', async () => {
    const rules = await lint(
        "import z from 'z';\nimport a from 'a';\nexport { a, z };",
        'apps/web/src/utils/example.js',
    );
    assert.ok(rules.includes('simple-import-sort/imports'));
});

test('conditional React hooks are rejected', async () => {
    const rules = await lint(
        `
    import { useState } from 'react';
    export function Example({ active }) {
      if (active) { useState(0); }
      return null;
    }
  `,
        'apps/web/src/components/ui/Example.jsx',
    );
    assert.ok(rules.includes('react-hooks/rules-of-hooks'));
});

test('missing hook dependencies are rejected', async () => {
    const rules = await lint(
        `
    import { useEffect } from 'react';
    export function useTitle(title) {
      useEffect(() => { document.title = title; }, []);
    }
  `,
        'apps/web/src/hooks/useTitle.js',
    );
    assert.ok(rules.includes('react-hooks/exhaustive-deps'));
});

test('JSX component references count as usage', async () => {
    const rules = await lint(
        `
    function Label() { return <span>Example</span>; }
    export function Example() { return <Label />; }
  `,
        'apps/web/src/components/ui/Example.jsx',
    );
    assert.deepEqual(rules, []);
});

test('Node rules require the node: protocol', async () => {
    const rules = await lint("import fs from 'fs';\nexport default fs;", 'apps/api/src/shared/utils/example.js');
    assert.ok(rules.includes('n/prefer-node-protocol'));
});

test('Prisma construction is restricted to database client infrastructure', async () => {
    const source = "import { PrismaClient } from '@prisma/client';\nexport { PrismaClient };";
    assert.ok(
        (await lint(source, 'apps/api/src/modules/example/repositories/example.repository.js')).includes(
            'no-restricted-imports',
        ),
    );
    assert.ok(
        !(await lint(source, 'apps/api/src/infrastructure/database/client.js')).includes('no-restricted-imports'),
    );
});

test('controllers cannot bypass services to access persistence', async () => {
    for (const target of [
        '@prisma/client',
        '#infrastructure/database/index.js',
        '../repositories/example.repository.js',
    ]) {
        const source = `import * as persistence from '${target}';\nexport { persistence };`;
        assert.ok(
            (await lint(source, 'apps/api/src/modules/example/controllers/example.controller.js')).includes(
                'no-restricted-imports',
            ),
        );
    }
});

test('browser, Node, and shared globals stay scoped', async () => {
    assert.ok(
        (await lint('export const secret = process.env.SECRET;', 'apps/web/src/utils/example.js')).includes('no-undef'),
    );
    assert.ok(
        (await lint('export const location = window.location;', 'apps/api/src/shared/utils/example.js')).includes(
            'no-undef',
        ),
    );
    assert.ok(
        (await lint('export const secret = process.env.SECRET;', 'packages/shared/src/example.js')).includes(
            'no-undef',
        ),
    );
    assert.deepEqual(await lint('export const title = document.title;', 'apps/web/src/utils/example.js'), []);
    assert.deepEqual(
        await lint('export const mode = process.env.NODE_ENV;', 'apps/api/src/shared/utils/example.js'),
        [],
    );
});

test('frontend editor and Vite aliases both target src', async () => {
    const editor = JSON.parse(await readFile(path.join(root, 'apps/web/jsconfig.json'), 'utf8'));
    assert.deepEqual(editor.compilerOptions.paths['@/*'], ['src/*']);
    const config = await resolveConfig({ configFile: path.join(root, 'apps/web/vite.config.js') }, 'build');
    const alias = config.resolve.alias.find((entry) => entry.find === '@');
    assert.equal(alias.replacement, path.join(root, 'apps/web/src'));
});

test('Node aliases resolve and import without a custom loader', async () => {
    const apiRoot = path.join(root, 'apps/api');
    const manifest = JSON.parse(await readFile(path.join(apiRoot, 'package.json'), 'utf8'));
    for (const directory of ['modules', 'infrastructure', 'shared', 'config']) {
        assert.equal(manifest.imports[`#${directory}/*`], `./src/${directory}/*`);
        const resolved = execFileSync(
            process.execPath,
            ['--input-type=module', '-e', `console.log(import.meta.resolve('#${directory}/example.js'));`],
            { cwd: apiRoot, encoding: 'utf8' },
        ).trim();
        assert.equal(resolved, new URL(`../../apps/api/src/${directory}/example.js`, import.meta.url).href);
    }
    const filename = `.alias-check-${process.pid}.js`;
    const fixture = path.join(apiRoot, 'src/config', filename);
    await writeFile(fixture, 'export default 42;\n', { flag: 'wx' });
    try {
        const output = execFileSync(
            process.execPath,
            ['--input-type=module', '-e', `console.log((await import('#config/${filename}')).default);`],
            { cwd: apiRoot, encoding: 'utf8' },
        );
        assert.equal(output.trim(), '42');
    } finally {
        await unlink(fixture);
    }
});
