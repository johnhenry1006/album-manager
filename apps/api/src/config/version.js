import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
export const appVersion = typeof manifest.version === 'string' && manifest.version ? manifest.version : undefined;
