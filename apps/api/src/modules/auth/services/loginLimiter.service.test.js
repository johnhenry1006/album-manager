import { expect, it } from 'vitest';

import { createLoginLimiter } from './loginLimiter.service.js';
it('limits attempts per socket IP and resets only after the window', () => {
    let now = 0;
    const limiter = createLoginLimiter({ loginRateLimitMax: 5, loginRateLimitWindowMs: 60000 }, () => now);
    for (let i = 0; i < 5; i++) limiter.check('127.0.0.1');
    expect(() => limiter.check('127.0.0.1')).toThrow(expect.objectContaining({ statusCode: 429, retryAfter: 60 }));
    expect(() => limiter.check('127.0.0.2')).not.toThrow();
    now = 59999;
    expect(() => limiter.check('127.0.0.1')).toThrow();
    now = 60000;
    expect(() => limiter.check('127.0.0.1')).not.toThrow();
    limiter.clear();
    expect(() => limiter.check('127.0.0.1')).not.toThrow();
});
