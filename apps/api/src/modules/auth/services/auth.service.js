import { createHash, randomBytes } from 'node:crypto';

import { publicUser } from '../mappers/auth.mapper.js';
import { validateCredentials, validSessionToken } from '../validators/auth.validator.js';
import { authError } from './auth.errors.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.service.js';
const digest = (token) => createHash('sha256').update(token).digest('hex');
export function createAuthService({ repository, config, clock = () => new Date() }) {
    return Object.freeze({
        async login(input, previousToken) {
            const { email, password } = validateCredentials(input);
            const user = await repository.findUserByEmail(email);
            const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
            if (!matches || !user?.passwordHash) throw authError();
            const now = clock();
            await repository.deleteExpiredSessions(now, 100);
            const token = randomBytes(32).toString('base64url');
            const csrfToken = randomBytes(32).toString('base64url');
            const expiresAt = new Date(now.getTime() + config.sessionLifetimeSeconds * 1000);
            await repository.createSession({
                userId: user.id,
                tokenHash: digest(token),
                csrfToken,
                createdAt: now,
                expiresAt,
            });
            if (validSessionToken(previousToken)) await repository.deleteSession(digest(previousToken));
            return { user: publicUser(user), csrfToken, token, expiresAt };
        },
        async authenticate(token) {
            if (!validSessionToken(token)) throw authError();
            const session = await repository.findSession(digest(token), clock());
            if (!session?.user?.passwordHash) throw authError();
            return { user: publicUser(session.user), csrfToken: session.csrfToken, sessionId: session.id };
        },
        async logout(token) {
            if (validSessionToken(token)) await repository.deleteSession(digest(token));
        },
        async provision(input) {
            const credentials = validateCredentials(input);
            const passwordHash = await hashPassword(credentials.password);
            return publicUser(await repository.provisionUser({ email: credentials.email, passwordHash }));
        },
    });
}
