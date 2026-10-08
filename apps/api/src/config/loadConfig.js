import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { validateEnvironment } from './environment.js';

export function loadEnvironment({
    environment = process.env,
    envFile = new URL('../../../../.env', import.meta.url),
} = {}) {
    const { error } = dotenv.config({
        path: envFile instanceof URL ? fileURLToPath(envFile) : envFile,
        processEnv: environment,
        override: false,
        quiet: true,
    });
    if (error && error.code !== 'ENOENT') {
        throw new Error('Unable to load API environment file', { cause: error });
    }
    return environment;
}

export function loadConfig(options) {
    return validateEnvironment(loadEnvironment(options));
}
