import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { validateAuthEnvironment } from '#config/auth.js';

import { createAuthRepository } from '../repositories/auth.repository.js';
import { createAuthService } from './auth.service.js';
import { hashPassword } from './password.service.js';

describe('session lifecycle', () => {
    it('stores a digest, expires sessions, and revokes on logout', async () => {
        const user = {
            id: 'a0000000-0000-4000-8000-000000000001',
            email: 'a@example.com',
            passwordHash: await hashPassword('a very long password'),
        };
        const sessions = new Map();
        let now = new Date('2026-10-09T00:00:00Z');
        const repository = {
            async findUserByEmail(email) {
                return email === user.email ? user : null;
            },
            async createSession(data) {
                sessions.set(data.tokenHash, { ...data, user, id: 'session' });
            },
            async findSession(hash, date) {
                const row = sessions.get(hash);
                return row?.expiresAt > date ? row : null;
            },
            async deleteSession(hash) {
                sessions.delete(hash);
            },
            async deleteExpiredSessions() {},
        };
        const service = createAuthService({ repository, config: validateAuthEnvironment({}), clock: () => now });
        const session = await service.login({ email: user.email, password: 'a very long password' });
        expect(session.user).toEqual({ id: user.id, email: user.email });
        expect(sessions.has(session.token)).toBe(false);
        expect(sessions.has(createHash('sha256').update(session.token).digest('hex'))).toBe(true);
        expect((await service.authenticate(session.token)).user.id).toBe(user.id);
        now = session.expiresAt;
        await expect(service.authenticate(session.token)).rejects.toMatchObject({ statusCode: 401 });
        await service.logout(session.token);
        expect(sessions.size).toBe(0);
        await expect(
            service.login({ email: 'unknown@example.com', password: 'a very long password' }),
        ).rejects.toMatchObject({ statusCode: 401 });
    });
    it('rejects malformed session tokens before querying persistence', async () => {
        const service = createAuthService({ repository: {}, config: validateAuthEnvironment({}) });
        await expect(service.authenticate('forged')).rejects.toMatchObject({ statusCode: 401 });
    });
    it('filters persisted sessions by digest and absolute expiry', async () => {
        let query;
        const repository = createAuthRepository({
            authSession: {
                findFirst(input) {
                    query = input;
                    return null;
                },
            },
        });
        const now = new Date();
        await repository.findSession('digest', now);
        expect(query.where).toEqual({ tokenHash: 'digest', expiresAt: { gt: now } });
        expect(query.select.user.select.passwordHash).toBe(true);
    });
});
