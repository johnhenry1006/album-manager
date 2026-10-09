import { authError } from '../services/auth.errors.js';
export function validateCredentials(input) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !['email', 'password'].includes(key))
    )
        throw authError(400);
    const { password } = input;
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== 'string' ||
        [...password].length < 15 ||
        [...password].length > 128 ||
        Buffer.byteLength(password) > 512
    )
        throw authError(400);
    return { email, password };
}
export function validSessionToken(token) {
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
