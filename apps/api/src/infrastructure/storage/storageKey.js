import { VARIANT_DIRECTORIES } from './storage.constants.js';

export function generateStorageKey({ id, createdAt, filename, variant = 'ORIGINAL' }) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
        throw new TypeError('Storage key requires a UUID');
    }
    if (
        !(createdAt instanceof Date) ||
        !Number.isFinite(createdAt.getTime()) ||
        createdAt.getUTCFullYear() < 1 ||
        createdAt.getUTCFullYear() > 9999
    ) {
        throw new TypeError('Storage key requires a valid creation date');
    }
    if (
        typeof filename !== 'string' ||
        [...filename].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    ) {
        throw new TypeError('Storage key requires a valid filename');
    }
    const basename = filename.replaceAll('\\', '/').split('/').at(-1).normalize('NFKC');
    let safeFilename = basename.replace(/[^a-z0-9._-]/gi, '_').replace(/^\.+/, '');
    if (!safeFilename) throw new TypeError('Storage key requires a valid filename');
    const directory = Object.hasOwn(VARIANT_DIRECTORIES, variant) && VARIANT_DIRECTORIES[variant];
    if (!directory) throw new TypeError('Unknown storage variant');
    if (safeFilename.length > 180) {
        const dot = safeFilename.lastIndexOf('.');
        const extension = dot > 0 ? safeFilename.slice(dot, dot + 21) : '';
        safeFilename = safeFilename.slice(0, 180 - extension.length) + extension;
    }
    const date = createdAt.toISOString().slice(0, 10).replaceAll('-', '/');
    return `media/${date}/${id.toLowerCase()}/${directory}/${safeFilename}`;
}
