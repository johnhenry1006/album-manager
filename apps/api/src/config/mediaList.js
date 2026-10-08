export function validateMediaListEnvironment(environment) {
    function integer(name, fallback, maximum) {
        const value = environment[name];
        if (value === undefined) return fallback;
        if (
            typeof value !== 'string' ||
            !/^\d+$/.test(value) ||
            !Number.isSafeInteger(Number(value)) ||
            Number(value) < 1 ||
            Number(value) > maximum
        ) {
            throw new Error(`Invalid media list configuration: ${name}`);
        }
        return Number(value);
    }
    return Object.freeze({
        maxLimit: integer('MEDIA_LIST_MAX_LIMIT', 200, 1000),
        urlExpirySeconds: integer('MEDIA_LIST_URL_EXPIRY_SECONDS', 900, 3600),
    });
}
