export function validateMediaDetailEnvironment(environment) {
    const config = {};
    for (const [name, field] of [
        ['MEDIA_DETAIL_URL_EXPIRY_SECONDS', 'displayUrlExpirySeconds'],
        ['MEDIA_ORIGINAL_URL_EXPIRY_SECONDS', 'originalUrlExpirySeconds'],
    ]) {
        const value = environment[name];
        if (
            value !== undefined &&
            (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 3600)
        )
            throw new Error(`Invalid media URL configuration: ${name}`);
        config[field] = value === undefined ? 900 : Number(value);
    }
    return Object.freeze(config);
}
