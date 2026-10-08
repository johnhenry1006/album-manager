export function createMediaTrashController(service) {
    return {
        list: (request) => service.list(request.query),
        async softDelete(request, reply) {
            await service.softDelete(request.params.mediaId, request.query, request.body);
            return reply.code(204).send();
        },
        async restore(request, reply) {
            await service.restore(request.params.mediaId, request.query, request.body);
            return reply.code(204).send();
        },
        async permanent(request, reply) {
            await service.permanent(request.params.mediaId, request.body, request.query);
            return reply.code(204).send();
        },
    };
}
