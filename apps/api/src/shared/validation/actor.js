export function requireActorId(actor) {
    if (
        !actor ||
        typeof actor.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor.id)
    )
        throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
    return actor.id;
}
