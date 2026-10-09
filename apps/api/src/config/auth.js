function integer(value, fallback, min, max) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid authentication configuration');
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < min || result > max)
        throw new Error('Invalid authentication configuration');
    return result;
}
export function validateAuthEnvironment(environment) {
    const production = environment.NODE_ENV === 'production';
    const secure = environment.AUTH_COOKIE_SECURE ?? (production ? 'true' : 'false');
    if (!['true', 'false'].includes(secure) || (production && secure !== 'true'))
        throw new Error('Invalid authentication cookie configuration');
    return Object.freeze({
        cookieName: 'album_session',
        cookieSecure: secure === 'true',
        sessionLifetimeSeconds: integer(environment.AUTH_SESSION_LIFETIME_SECONDS, 28800, 900, 604800),
        loginRateLimitMax: integer(environment.AUTH_LOGIN_RATE_LIMIT_MAX, 5, 1, 100),
        loginRateLimitWindowMs: 60000,
    });
}
