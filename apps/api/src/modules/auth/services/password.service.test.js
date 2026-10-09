import { describe, expect, it } from 'vitest';

import { validateAuthEnvironment } from '#config/auth.js';

import { validateCredentials } from '../validators/auth.validator.js';
import { hashPassword, verifyPassword } from './password.service.js';

describe('local credentials', () => {
    it('verifies salted passwords without changing spaces or Unicode', async () => {
        const password = '  a long mật khẩu 🔐  ';
        const a = await hashPassword(password);
        const b = await hashPassword(password);
        expect(a).not.toBe(b);
        expect(await verifyPassword(password, a)).toBe(true);
        expect(await verifyPassword(password.trim(), a)).toBe(false);
        expect(await verifyPassword('wrong password', a)).toBe(false);
        expect(await verifyPassword(password, 'scrypt$999999999$invalid')).toBe(false);
    });
    it('rejects unknown fields and invalid credentials', () => {
        expect(validateCredentials({ email: ' A@Example.com ', password: 'very long password' })).toEqual({
            email: 'a@example.com',
            password: 'very long password',
        });
        for (const input of [
            { email: 'invalid', password: 'very long password' },
            { email: 'a@b.com', password: 'short' },
            { email: 'a@b.com', password: 'very long password', userId: 'forged' },
        ]) {
            expect(() => validateCredentials(input)).toThrow();
        }
    });
    it('enforces secure production cookies and bounded lifetime', () => {
        expect(validateAuthEnvironment({ NODE_ENV: 'production' }).cookieSecure).toBe(true);
        expect(() => validateAuthEnvironment({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' })).toThrow();
        for (const lifetime of ['899', '604801', 'NaN'])
            expect(() => validateAuthEnvironment({ AUTH_SESSION_LIFETIME_SECONDS: lifetime })).toThrow();
    });
});
