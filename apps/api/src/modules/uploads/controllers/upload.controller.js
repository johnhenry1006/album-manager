import { mapUploadFile, mapUploadSession } from '../mappers/upload.mapper.js';

export function createUploadController(service) {
    return {
        async createSession(request, reply) {
            return reply.code(201).send(mapUploadSession(await service.createSession(request.body ?? {})));
        },
        async registerFile(request, reply) {
            return reply
                .code(201)
                .send(mapUploadFile(await service.registerFile(request.params.sessionId, request.body)));
        },
        async presign(request) {
            return service.presign(request.params.uploadFileId);
        },
        async complete(request, reply) {
            const result = await service.complete(request.params.uploadFileId);
            return reply.code(result.status === 'READY' ? 200 : 202).send(result);
        },
        async resolveDuplicate(request, reply) {
            const result = await service.resolveDuplicate(request.params.uploadFileId, request.body);
            return reply.code(result.status === 'PROCESSING' ? 202 : 200).send(result);
        },
        async loadSession(request) {
            return mapUploadSession(
                await service.loadSession(request.params.sessionId, {
                    ...request.query,
                    ...(request.query.limit === undefined ? {} : { limit: Number(request.query.limit) }),
                }),
            );
        },
    };
}
