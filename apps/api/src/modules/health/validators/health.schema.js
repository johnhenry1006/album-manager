export const healthResponseSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'timestamp'],
    properties: {
        status: { type: 'string', const: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        version: { type: 'string' },
    },
};
