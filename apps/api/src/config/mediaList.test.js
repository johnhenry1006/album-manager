import { describe, expect, it } from 'vitest';

import { validateMediaListEnvironment } from './mediaList.js';

describe('media list configuration', () => {
    it('defaults to 200 items and 900-second thumbnail URLs', () => {
        expect(validateMediaListEnvironment({})).toEqual({ maxLimit: 200, urlExpirySeconds: 900 });
    });
    it('accepts configurable bounds', () => {
        expect(
            validateMediaListEnvironment({ MEDIA_LIST_MAX_LIMIT: '1000', MEDIA_LIST_URL_EXPIRY_SECONDS: '3600' }),
        ).toEqual({ maxLimit: 1000, urlExpirySeconds: 3600 });
    });
    it.each(['0', '-1', '1.5', '1e2', '', '1001', '9007199254740993', 20])('rejects invalid maximum %s', (value) => {
        expect(() => validateMediaListEnvironment({ MEDIA_LIST_MAX_LIMIT: value })).toThrow();
    });
    it.each(['0', '-1', '3601', '', 'abc'])('rejects invalid URL expiry %s', (value) => {
        expect(() => validateMediaListEnvironment({ MEDIA_LIST_URL_EXPIRY_SECONDS: value })).toThrow();
    });
});
