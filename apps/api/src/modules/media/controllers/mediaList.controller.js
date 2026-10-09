export function createMediaListController(service) {
    return { list: (request) => service.list(request.query, request.actor) };
}
