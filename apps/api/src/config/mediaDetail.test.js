import { describe, expect, it } from 'vitest';

import { validateMediaDetailEnvironment } from './mediaDetail.js';

describe('media detail URL expiry configuration', () => {
    it('defaults both expiry policies to 900 seconds', () => {
        expect(validateMediaDetailEnvironment({})).toEqual({
            displayUrlExpirySeconds: 900,
            originalUrlExpirySeconds: 900,
        });
    });
    it('permits separate finite policies within one hour and ignores unrelated secrets', () => {
        expect(
            validateMediaDetailEnvironment({
                MEDIA_DETAIL_URL_EXPIRY_SECONDS: '1',
                MEDIA_ORIGINAL_URL_EXPIRY_SECONDS: '3600',
                S3_SECRET_KEY: 'private',
            }),
        ).toEqual({ displayUrlExpirySeconds: 1, originalUrlExpirySeconds: 3600 });
    });
    for (const name of ['MEDIA_DETAIL_URL_EXPIRY_SECONDS', 'MEDIA_ORIGINAL_URL_EXPIRY_SECONDS']) {
        it.each(['0', '-1', '3601', '1.5', '1e2', '', 'NaN', '9007199254740993', 900])(
            `rejects invalid ${name}=%s`,
            (value) => {
                expect(() => validateMediaDetailEnvironment({ [name]: value })).toThrow();
            },
        );
    }
});
