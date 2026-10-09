import { isIP } from 'node:net';

import { validateSecurityEnvironment } from './security.js';
import { appVersion } from './version.js';

const environments = new Set(['development', 'test', 'production']);
const logLevels = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']);

function invalid(name) {
    throw new Error(`Invalid API configuration: ${name}`);
}

function integer(value, fallback, name, maximum) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) invalid(name);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > maximum) invalid(name);
    return number;
}

export function validateEnvironment(environment) {
    const nodeEnv = environment.NODE_ENV ?? 'development';
    const logLevel = environment.LOG_LEVEL ?? 'info';
    const host = environment.API_HOST ?? '127.0.0.1';
    if (!environments.has(nodeEnv)) invalid('NODE_ENV');
    if (!logLevels.has(logLevel)) invalid('LOG_LEVEL');
    if (
        typeof host !== 'string' ||
        (!isIP(host) &&
            (host.length > 253 ||
                !host
                    .split('.')
                    .every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))))
    ) {
        invalid('API_HOST');
    }
    return Object.freeze({
        security: validateSecurityEnvironment(environment),
        nodeEnv,
        host,
        logLevel,
        port: integer(environment.API_PORT, 3000, 'API_PORT', 65535),
        shutdownTimeoutMs: integer(environment.API_SHUTDOWN_TIMEOUT_MS, 10000, 'API_SHUTDOWN_TIMEOUT_MS', 120000),
        version: appVersion,
    });
}
