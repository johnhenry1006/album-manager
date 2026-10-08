import { randomUUID } from 'node:crypto';

export function generatedSlug(name, fallback = 'album') {
    const stem = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 180)
        .replace(/-$/, '');
    return `${stem || fallback}-${randomUUID()}`;
}
