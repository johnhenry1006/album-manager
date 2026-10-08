import { isIP } from 'node:net';

export function validateQueueEnvironment(environment) {
    function integer(name, fallback, minimum, maximum) {
        const value = environment[name];
        if (value === undefined) return fallback;
        if (
            typeof value !== 'string' ||
            !/^\d+$/.test(value) ||
            !Number.isSafeInteger(Number(value)) ||
            Number(value) < minimum ||
            Number(value) > maximum
        )
            throw new Error(`Invalid queue configuration: ${name}`);
        return Number(value);
    }
    const host = environment.REDIS_HOST ?? 'localhost';
    if (
        typeof host !== 'string' ||
        (!isIP(host) &&
            (host.length > 253 ||
                !host.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))))
    )
        throw new Error('Invalid queue configuration: REDIS_HOST');
    const tls = environment.REDIS_TLS ?? 'false';
    if (!['true', 'false'].includes(tls)) throw new Error('Invalid queue configuration: REDIS_TLS');
    const prefix = environment.QUEUE_PREFIX ?? 'album-manager';
    if (typeof prefix !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(prefix))
        throw new Error('Invalid queue configuration: QUEUE_PREFIX');
    const password = environment.REDIS_PASSWORD || undefined;
    if (password !== undefined && (typeof password !== 'string' || /[\r\n\0]/.test(password)))
        throw new Error('Invalid queue configuration: REDIS_PASSWORD');
    return Object.freeze({
        host,
        password,
        tls: tls === 'true',
        prefix,
        port: integer('REDIS_PORT', 6380, 1, 65535),
        db: integer('REDIS_DB', 0, 0, 15),
        connectTimeoutMs: integer('REDIS_CONNECT_TIMEOUT_MS', 10000, 1, 120000),
    });
}
