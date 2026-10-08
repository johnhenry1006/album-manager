// Adapter contract: encoded bytes in, inspected metadata/independent derivative buffers out.
export class ImageProcessor {
    async inspect(_input) {
        throw new Error('Image inspection is not implemented');
    }
    async extractMetadata(_input) {
        throw new Error('Image metadata extraction is not implemented');
    }
    async process(_input, _options) {
        throw new Error('Image processing is not implemented');
    }
}
export class ImageProcessingError extends Error {
    constructor(operation) {
        super(`Image ${operation} failed`);
        this.name = 'ImageProcessingError';
        this.code = 'IMAGE_PROCESSING_FAILED';
        this.statusCode = 422;
        this.operation = operation;
    }
}
