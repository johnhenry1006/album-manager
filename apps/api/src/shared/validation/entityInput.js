function invalid(message) {
    return Object.assign(new Error(message), { statusCode: 400 });
}

export function validateId(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))
        throw invalid('Expected a UUID');
    return value.toLowerCase();
}

export function validateObject(input, fields) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !fields.includes(key))
    )
        throw invalid('Invalid input fields');
    return { ...input };
}

export function validateQuery(input, fields) {
    const data = validateObject(input, fields);
    if (Object.values(data).some((value) => typeof value !== 'string')) throw invalid('Expected scalar query values');
    return data;
}

export function validatePositiveInteger(value, fallback, max) {
    if (value === undefined) return fallback;
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > max)
        throw invalid('Invalid pagination');
    return number;
}

export function validateNameSlug(data) {
    if (Object.hasOwn(data, 'name')) {
        if (
            typeof data.name !== 'string' ||
            !data.name.trim() ||
            data.name.trim().length > 255 ||
            /[\r\n\0]/.test(data.name)
        )
            throw invalid('Invalid name');
        data.name = data.name.trim();
    }
    if (
        Object.hasOwn(data, 'slug') &&
        (typeof data.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) || data.slug.length > 255)
    )
        throw invalid('Invalid slug');
    return data;
}
