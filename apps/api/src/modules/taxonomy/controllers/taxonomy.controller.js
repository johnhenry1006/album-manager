export function createTaxonomyController(service, { serializeList } = {}) {
    return {
        list: async (request, reply) => {
            const result = await service.list(request.query);
            if (serializeList) reply.serializer(serializeList);
            return result;
        },
        create: async (request, reply) => reply.code(201).send(await service.create(request.body)),
        update: (request) => service.update(request.params.id, request.body),
        remove: async (request, reply) => {
            await service.remove(request.params.id);
            return reply.code(204).send();
        },
        assignMedia: (request) => service.assignMedia(request.params.mediaId, request.body),
        assignBatch: (request) => service.assignBatch(request.body),
    };
}
