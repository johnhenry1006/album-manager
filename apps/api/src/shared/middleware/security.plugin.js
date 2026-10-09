import fastifyPlugin from 'fastify-plugin';

import { validateSecurityEnvironment } from '#config/security.js';

const METHODS = ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
const HEADERS = ['content-type', 'accept'];
function reject(statusCode) {
    throw Object.assign(new Error('Request rejected'), { statusCode });
}
async function security(app, { policy = validateSecurityEnvironment({}) }) {
    // One bounded fixed-window counter per socket IP. Forwarded headers are not trusted.
    const clients = new Map();
    app.addHook('onClose', async () => clients.clear());
    app.addHook('onRequest', async (request, reply) => {
        reply.headers({
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            'Cache-Control': 'no-store',
            Vary: 'Origin',
        });
        if (request.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=31536000');
        const now = Date.now();
        let counter = clients.get(request.ip);
        if (!counter || counter.until <= now) {
            for (const [ip, entry] of clients) if (entry.until <= now) clients.delete(ip);
            // Fail closed rather than evict active clients and reset their quotas.
            if (!counter && clients.size >= 10000) {
                reply.header('Retry-After', Math.ceil(policy.rateLimitWindowMs / 1000));
                reject(429);
            }
            counter = { total: 0, writes: 0, until: now + policy.rateLimitWindowMs };
            clients.set(request.ip, counter);
        }
        counter.total++;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) counter.writes++;
        if (counter.total > policy.rateLimitMax || counter.writes > policy.writeRateLimitMax) {
            reply.header('Retry-After', Math.max(1, Math.ceil((counter.until - now) / 1000)));
            reject(429);
        }
        const origin = request.headers.origin;
        if (origin !== undefined) {
            if (typeof origin !== 'string' || !policy.allowedOrigins.includes(origin)) reject(403);
            reply.header('Access-Control-Allow-Origin', origin);
        }
        if (request.method === 'OPTIONS') {
            const method = request.headers['access-control-request-method'];
            const headers = request.headers['access-control-request-headers'] ?? '';
            if (
                !origin ||
                !METHODS.includes(method) ||
                typeof headers !== 'string' ||
                headers.split(',').some((header) => header.trim() && !HEADERS.includes(header.trim().toLowerCase()))
            )
                reject(403);
            reply.headers({
                'Access-Control-Allow-Methods': METHODS.join(', '),
                'Access-Control-Allow-Headers': HEADERS.join(', '),
                'Access-Control-Max-Age': '600',
            });
            return reply.code(204).send();
        }
        if (
            ['GET', 'HEAD'].includes(request.method) &&
            (Number(request.headers['content-length']) > 0 || request.headers['transfer-encoding'])
        )
            reject(400);
        const type = request.headers['content-type'];
        if (type && type.split(';')[0].trim().toLowerCase() !== 'application/json') reject(415);
    });
}
export default fastifyPlugin(security, { name: 'http-security', fastify: '5.x' });
