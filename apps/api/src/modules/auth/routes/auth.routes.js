import { createAuthController } from '../controllers/auth.controller.js';
import { createLoginLimiter } from '../services/loginLimiter.service.js';
import { authenticateRequest } from './auth.plugin.js';
const empty = { type: 'object', additionalProperties: false, properties: {} };
export async function authRoutes(app, { service, config }) {
    const controller = createAuthController(service, config);
    const limiter = createLoginLimiter(config);
    app.addHook('onClose', async () => limiter.clear());
    app.post(
        '/auth/login',
        {
            schema: {
                querystring: empty,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', maxLength: 254 },
                        password: { type: 'string', maxLength: 512 },
                    },
                },
            },
            onRequest: async (request, reply) => {
                try {
                    limiter.check(request.ip);
                } catch (error) {
                    reply.header('Retry-After', error.retryAfter);
                    throw error;
                }
            },
        },
        controller.login,
    );
    const protect = async (request) => authenticateRequest(request, service, config);
    app.get('/auth/me', { schema: { querystring: empty }, onRequest: protect }, controller.me);
    app.post(
        '/auth/logout',
        {
            schema: { querystring: empty },
            onRequest: protect,
            preValidation: async (request) => {
                if (request.body !== undefined) throw Object.assign(new Error(), { statusCode: 400 });
            },
        },
        controller.logout,
    );
}
