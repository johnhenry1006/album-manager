import { validateInput, validateMediaId } from '../validators/semantic.validator.js';

export function createSemanticController(service) {
    return {
        text: (request) => service.text(validateInput(request.body, { text: true })),
        similar: (request) => service.similar(validateMediaId(request.params.mediaId), validateInput(request.query)),
        tags: (request) => service.tags(validateMediaId(request.params.mediaId)),
    };
}
