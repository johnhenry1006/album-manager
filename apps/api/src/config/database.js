import { isIP } from 'node:net';

function invalid(name) {
    throw new Error(`Invalid database configuration: ${name}`);
}

export function validateDatabaseEnvironment(environment) {
    let databaseUrl = environment.DATABASE_URL;
    if (databaseUrl === undefined) {
        const host = environment.POSTGRES_HOST ?? 'localhost';
        const port = environment.POSTGRES_PORT ?? '5434';
        const database = environment.POSTGRES_DB ?? 'album_manager';
        const user = environment.POSTGRES_USER ?? 'album_manager';
        const password = environment.POSTGRES_PASSWORD;
        if (typeof password !== 'string' || !password) invalid('POSTGRES_PASSWORD');
        if (typeof host !== 'string' || (!isIP(host) && !/^[a-z0-9.-]+$/i.test(host))) invalid('POSTGRES_HOST');
        if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) invalid('POSTGRES_PORT');
        if (typeof database !== 'string' || !database) invalid('POSTGRES_DB');
        if (typeof user !== 'string' || !user) invalid('POSTGRES_USER');
        const hostname = isIP(host) === 6 ? `[${host}]` : host;
        databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${hostname}:${port}/${encodeURIComponent(database)}`;
    }
    try {
        const url = new URL(databaseUrl);
        if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.pathname.length <= 1) {
            invalid('DATABASE_URL');
        }
    } catch {
        invalid('DATABASE_URL');
    }
    return Object.freeze({ databaseUrl });
}
