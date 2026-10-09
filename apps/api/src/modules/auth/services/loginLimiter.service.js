import { authError } from './auth.errors.js';
export function createLoginLimiter(config, clock = Date.now) {
    const entries = new Map();
    return {
        clear() {
            entries.clear();
        },
        check(ip) {
            const now = clock();
            let entry = entries.get(ip);
            if (!entry || entry.until <= now) {
                for (const [key, value] of entries) if (value.until <= now) entries.delete(key);
                if (!entry && entries.size >= 10000) throw Object.assign(authError(429), { retryAfter: 60 });
                entry = { count: 0, until: now + config.loginRateLimitWindowMs };
                entries.set(ip, entry);
            }
            if (++entry.count > config.loginRateLimitMax)
                throw Object.assign(authError(429), { retryAfter: Math.max(1, Math.ceil((entry.until - now) / 1000)) });
        },
    };
}
