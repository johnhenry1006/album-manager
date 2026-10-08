import { expect, it } from 'vitest';

import { validateQueueEnvironment } from './queue.js';

it('validates producer Redis connection settings', () => {
    expect(
        validateQueueEnvironment({
            REDIS_HOST: 'redis',
            REDIS_PORT: '6379',
            REDIS_DB: '2',
            REDIS_TLS: 'true',
            REDIS_PASSWORD: 'secret',
            QUEUE_PREFIX: 'test',
        }),
    ).toMatchObject({ host: 'redis', port: 6379, db: 2, tls: true, password: 'secret', prefix: 'test' });
});
it.each([
    { REDIS_HOST: 'bad/host' },
    { REDIS_PORT: '0' },
    { REDIS_DB: '-1' },
    { REDIS_TLS: 'yes' },
    { QUEUE_PREFIX: 'a:b' },
    { REDIS_PASSWORD: 'secret\n' },
])('rejects malformed queue configuration %j safely', (environment) => {
    expect(() => validateQueueEnvironment(environment)).toThrow(/^Invalid queue configuration: [A-Z_]+$/);
});
