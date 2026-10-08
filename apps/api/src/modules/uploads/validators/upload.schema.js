const id = { type: 'string', format: 'uuid' };
export const sessionParams = {
    type: 'object',
    additionalProperties: false,
    required: ['sessionId'],
    properties: { sessionId: id },
};
export const fileParams = {
    type: 'object',
    additionalProperties: false,
    required: ['uploadFileId'],
    properties: { uploadFileId: id },
};
export const emptyBody = { type: 'object', additionalProperties: false, maxProperties: 0 };
export const fileBody = {
    type: 'object',
    additionalProperties: false,
    required: ['filename', 'mimeType', 'fileSize'],
    properties: {
        filename: { type: 'string', minLength: 1, maxLength: 255 },
        mimeType: { type: 'string', maxLength: 100 },
        fileSize: {
            anyOf: [
                { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
                { type: 'string', pattern: '^[0-9]+$', maxLength: 19 },
            ],
        },
    },
};
export const sessionQuery = {
    type: 'object',
    additionalProperties: false,
    properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 }, cursor: id },
};
export const completionResponse = {
    type: 'object',
    additionalProperties: false,
    required: ['uploadFileId', 'status', 'mediaId'],
    properties: { uploadFileId: id, mediaId: id, status: { type: 'string' } },
};

export const duplicateResolutionBody = {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: { action: { type: 'string', enum: ['SKIP', 'USE_EXISTING', 'KEEP_BOTH'] } },
};
export const duplicateResolutionResponse = {
    type: 'object',
    additionalProperties: false,
    required: ['uploadFileId', 'status', 'finalMediaId', 'duplicateOfMediaId'],
    properties: {
        uploadFileId: id,
        status: { type: 'string' },
        finalMediaId: { anyOf: [id, { type: 'null' }] },
        duplicateOfMediaId: { anyOf: [id, { type: 'null' }] },
    },
};
