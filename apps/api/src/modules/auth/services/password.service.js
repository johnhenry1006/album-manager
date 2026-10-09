import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
export async function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = await derive(password, salt, 64, options);
    return `scrypt$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
    if (
        typeof password !== 'string' ||
        Buffer.byteLength(password) > 512 ||
        typeof encoded !== 'string' ||
        !/^scrypt\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded)
    )
        return false;
    const [, , salt, expected] = encoded.split('$');
    const actual = await derive(password, Buffer.from(salt, 'hex'), 64, options);
    return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
// Fixed well-formed hash for constant-work unknown-account verification; cannot provision a user.
export const DUMMY_PASSWORD_HASH = `scrypt$1$${'00'.repeat(16)}$${'00'.repeat(64)}`;
