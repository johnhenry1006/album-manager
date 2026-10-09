function hasControlCharacters(text) {
    return [...text].some((character) => character.charCodeAt(0) < 32);
}
export function semanticError(statusCode, message = 'Invalid semantic input') {
    return Object.assign(new Error(message), { statusCode });
}
export function validateProfile(profile) {
    if (
        !profile ||
        !['space', 'model'].every((key) => typeof profile[key] === 'string' && /^[\w.:-]{1,128}$/.test(profile[key])) ||
        !Number.isInteger(profile.dimensions) ||
        profile.dimensions < 1 ||
        profile.dimensions > 4096
    )
        throw new TypeError('Invalid embedding profile');
    return Object.freeze({ space: profile.space, model: profile.model, dimensions: profile.dimensions });
}
export function validateProviders(embeddingProvider, tagProvider) {
    const profile = validateProfile(embeddingProvider?.profile);
    if (typeof embeddingProvider.embedImage !== 'function' || typeof embeddingProvider.embedText !== 'function')
        throw new TypeError('Embedding provider requires image and text encoders');
    if (
        tagProvider &&
        (typeof tagProvider.tagImage !== 'function' ||
            typeof tagProvider.revision !== 'string' ||
            !/^[\w.:-]{1,128}$/.test(tagProvider.revision))
    )
        throw new TypeError('Invalid tag provider');
    return profile;
}
export function normalizeVector(vector, profile) {
    if (
        !Array.isArray(vector) ||
        vector.length !== profile.dimensions ||
        !vector.every((value) => typeof value === 'number' && Number.isFinite(value))
    )
        throw semanticError(503, 'Invalid provider vector');
    const scale = Math.max(...vector.map(Math.abs));
    if (scale === 0) throw semanticError(503, 'Invalid provider vector');
    const scaled = vector.map((value) => value / scale);
    const norm = Math.hypot(...scaled);
    return scaled.map((value) => value / norm);
}
export function validateTags(tags) {
    if (!Array.isArray(tags) || tags.length > 100) throw semanticError(503);
    return tags.map((tag) => {
        if (
            !tag ||
            typeof tag.label !== 'string' ||
            !tag.label.trim() ||
            tag.label.length > 128 ||
            hasControlCharacters(tag.label) ||
            !Number.isFinite(tag.confidence) ||
            tag.confidence < 0 ||
            tag.confidence > 1
        )
            throw semanticError(503);
        return { label: tag.label.trim(), confidence: tag.confidence };
    });
}
export function validateMediaId(id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw semanticError(400);
    return id.toLowerCase();
}
export function validateInput(input, { text = false, job = false } = {}) {
    const keys = job ? ['mediaId'] : text ? ['text', 'limit', 'cursor'] : ['limit', 'cursor'];
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !keys.includes(key))
    )
        throw semanticError(400);
    if (job) return { mediaId: validateMediaId(input.mediaId) };
    const limit = input.limit === undefined ? 20 : Number(input.limit);
    if (
        !['number', 'string', 'undefined'].includes(typeof input.limit) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
    )
        throw semanticError(400);
    if (
        input.cursor !== undefined &&
        (typeof input.cursor !== 'string' || input.cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(input.cursor))
    )
        throw semanticError(400);
    if (
        text &&
        (typeof input.text !== 'string' ||
            !input.text.trim() ||
            input.text.length > 2000 ||
            hasControlCharacters(input.text))
    )
        throw semanticError(400);
    return { limit, cursor: input.cursor, ...(text ? { text: input.text.trim() } : {}) };
}
export function matchesProfile(record, profile) {
    return (
        record?.space === profile.space && record.model === profile.model && record.dimensions === profile.dimensions
    );
}
