export function errorHandler(error, request, reply) {
    const statusCode =
        Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
            ? error.statusCode
            : 500;
    const isServerError = statusCode >= 500;
    const code = isServerError ? 'INTERNAL_ERROR' : error.validation ? 'VALIDATION_ERROR' : 'HTTP_ERROR';
    const message = isServerError
        ? 'Internal server error'
        : error.validation
          ? 'Invalid request input'
          : statusCode === 404
            ? 'Route not found'
            : 'Request failed';
    if (isServerError) request.log.error({ err: error }, 'Request failed');
    return reply.code(statusCode).send({ statusCode, error: code, message, requestId: request.id });
}
