export function createMediaDetailController(service) {
    return {
        detail: (request) => service.detail(request.params.mediaId, request.query),
        originalUrl: (request) => service.originalUrl(request.params.mediaId, request.query),
    };
}
