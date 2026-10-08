export function createMediaFavoriteController(service) {
    return {
        async add(request, reply) {
            await service.add(request.params.mediaId, request.query, request.body);
            return reply.code(204).send();
        },
        async remove(request, reply) {
            await service.remove(request.params.mediaId, request.query, request.body);
            return reply.code(204).send();
        },
    };
}
