import { publicSession } from '../mappers/auth.mapper.js';
import { sessionCookie } from '../routes/auth.plugin.js';
import { authError } from '../services/auth.errors.js';
export function createAuthController(service, config) {
    const cookieOptions = { path: '/api', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure };
    return {
        async login(request, reply) {
            if (request.headers['x-auth-request'] !== '1') throw authError(403);
            const session = await service.login(request.body, sessionCookie(request, config));
            reply.setCookie(config.cookieName, session.token, {
                ...cookieOptions,
                maxAge: config.sessionLifetimeSeconds,
            });
            return publicSession(session);
        },
        me(request) {
            return publicSession(request.authSession);
        },
        async logout(request, reply) {
            await service.logout(sessionCookie(request, config));
            reply.clearCookie(config.cookieName, cookieOptions);
            return reply.code(204).send();
        },
    };
}
