function invalid(name) {
    throw new Error(`Invalid security configuration: ${name}`);
}
function integer(environment, name, fallback, maximum) {
    const value = environment[name];
    if (value === undefined) return fallback;
    if (
        typeof value !== 'string' ||
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < 1 ||
        Number(value) > maximum
    )
        invalid(name);
    return Number(value);
}
export function validateSecurityEnvironment(environment) {
    const value = environment.FRONTEND_ORIGIN;
    const origins =
        value === undefined || value === '' ? [] : typeof value === 'string' ? [value] : invalid('FRONTEND_ORIGIN');
    for (const origin of origins) {
        let url;
        try {
            url = new URL(origin);
        } catch {
            invalid('FRONTEND_ORIGIN');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== origin)
            invalid('FRONTEND_ORIGIN');
    }
    return Object.freeze({
        allowedOrigins: Object.freeze([...new Set(origins)]),
        rateLimitMax: integer(environment, 'API_RATE_LIMIT_MAX', 600, 100000),
        writeRateLimitMax: integer(environment, 'API_WRITE_RATE_LIMIT_MAX', 120, 100000),
        rateLimitWindowMs: integer(environment, 'API_RATE_LIMIT_WINDOW_MS', 60000, 3600000),
    });
}
