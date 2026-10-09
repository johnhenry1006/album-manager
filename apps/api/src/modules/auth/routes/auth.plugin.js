import { timingSafeEqual } from 'node:crypto';

import { authError } from '../services/auth.errors.js';
export function sessionCookie(request, config) {
    const header = request.headers.cookie ?? '';
    if (
        typeof header !== 'string' ||
        header.split(';').filter((part) => part.trim().split('=')[0] === config.cookieName).length > 1
    )
        throw authError();
    return request.cookies[config.cookieName];
}
export async function authenticateRequest(request, service, config) {
    const session = await service.authenticate(sessionCookie(request, config));
    request.actor = session.user;
    request.authSession = session;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const csrf = request.headers['x-csrf-token'];
        if (typeof csrf !== 'string' || csrf.length > 128 || typeof session.csrfToken !== 'string')
            throw authError(403);
        const actual = Buffer.from(csrf);
        const expected = Buffer.from(session.csrfToken);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw authError(403);
    }
}
export async function authProtection(app, { service, config }) {
    app.addHook('onRequest', async (request) => authenticateRequest(request, service, config));
}
