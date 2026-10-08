import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
let template = await readFile(new URL('.env.example', root), 'utf8');
for (const name of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
    const placeholder = new RegExp(`^${name}=$`, 'm');
    if (!placeholder.test(template)) {
        throw new Error(`Expected a blank ${name} in .env.example`);
    }
    template = template.replace(placeholder, `${name}=${randomBytes(24).toString('hex')}`);
}

try {
    await writeFile(new URL('.env', root), template, { flag: 'wx', mode: 0o600 });
    console.log('Created .env with generated local credentials. Secrets were not printed.');
} catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error('.env already exists; preserved it. Edit it locally to change your settings.');
    process.exitCode = 1;
}
