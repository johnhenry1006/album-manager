export function createAlbumController(service) {
    return {
        list: (request) => service.list(request.query),
        create: async (request, reply) => reply.code(201).send(await service.create(request.body)),
        detail: (request) => service.detail(request.params.albumId),
        update: (request) => service.update(request.params.albumId, request.body),
        remove: async (request, reply) => {
            await service.remove(request.params.albumId);
            return reply.code(204).send();
        },
        listMedia: (request) => service.listMedia(request.params.albumId, request.query),
        addMedia: (request) => service.addMedia(request.params.albumId, request.body),
        removeMedia: async (request, reply) => {
            await service.removeMedia(request.params.albumId, request.params.mediaId);
            return reply.code(204).send();
        },
    };
}
