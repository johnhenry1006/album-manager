import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment.js';

describe('API environment validation', () => {
    it('uses local defaults and selects only API settings', () => {
        const config = validateEnvironment({ S3_SECRET_KEY: 'must-not-enter-app-config' });
        expect(config).toMatchObject({ nodeEnv: 'development', host: '127.0.0.1', port: 3000, logLevel: 'info' });
        expect(config.shutdownTimeoutMs).toBe(10000);
        expect(config).not.toHaveProperty('S3_SECRET_KEY');
        expect(Object.isFrozen(config)).toBe(true);
    });

    it('converts explicitly supplied numeric configuration', () => {
        expect(
            validateEnvironment({ API_PORT: '4100', API_HOST: '0.0.0.0', API_SHUTDOWN_TIMEOUT_MS: '5000' }),
        ).toMatchObject({ port: 4100, host: '0.0.0.0', shutdownTimeoutMs: 5000 });
    });

    it.each(['0', '65536', '3.5', '3000abc', '', ' ', '-1'])('rejects invalid port %j', (port) => {
        expect(() => validateEnvironment({ API_PORT: port })).toThrow(/API_PORT/);
    });

    it.each([
        { NODE_ENV: 'unknown' },
        { LOG_LEVEL: 'unknown' },
        { API_HOST: '' },
        { API_HOST: 'http://localhost' },
        { API_SHUTDOWN_TIMEOUT_MS: '0' },
        { API_HOST: 'a..b' },
    ])('rejects malformed settings without including supplied values', (environment) => {
        expect(() => validateEnvironment(environment)).toThrow(/Invalid API configuration/);
    });
});
