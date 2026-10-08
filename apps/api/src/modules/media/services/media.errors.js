// Transport-independent errors compatible with the centralized error handler.
export class MediaDomainError extends Error {
    constructor(code, message, statusCode, details = {}) {
        super(message);
        this.name = 'MediaDomainError';
        this.code = code;
        this.statusCode = statusCode;
        Object.assign(this, details);
    }
}

export function invalid(message) {
    return new MediaDomainError('INVALID_MEDIA_INPUT', message, 400);
}

export function notFound(entity = 'Media') {
    return new MediaDomainError('MEDIA_NOT_FOUND', `${entity} not found`, 404);
}
