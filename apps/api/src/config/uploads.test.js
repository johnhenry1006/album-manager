import { expect, it } from 'vitest';

import { validateUploadEnvironment } from './uploads.js';

it('loads configured upload limits and a supported MIME subset', () => {
    expect(
        validateUploadEnvironment({
            UPLOAD_MAX_FILE_SIZE_BYTES: '1234',
            UPLOAD_MAX_FILES_PER_SESSION: '2',
            UPLOAD_SUPPORTED_MIME_TYPES: 'image/jpeg,image/png',
        }),
    ).toMatchObject({ maxFileSize: 1234, maxFilesPerSession: 2, supportedMimeTypes: ['image/jpeg', 'image/png'] });
});
it.each([
    { UPLOAD_MAX_FILE_SIZE_BYTES: '0' },
    { UPLOAD_MAX_FILE_SIZE_BYTES: '5368709121' },
    { UPLOAD_MAX_FILES_PER_SESSION: '-1' },
    { UPLOAD_SUPPORTED_MIME_TYPES: 'text/html' },
])('rejects invalid upload configuration %j', (input) => {
    expect(() => validateUploadEnvironment(input)).toThrow('Invalid upload configuration');
});
