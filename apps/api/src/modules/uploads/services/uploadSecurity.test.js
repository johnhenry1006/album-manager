import { expect, it } from 'vitest';

import { validateUploadEnvironment } from '#config/uploads.js';

import { validateUploadFile } from '../validators/upload.validator.js';
import { fixture } from './uploadTestFixture.js';

it.each(['photo.html', 'photo.png', 'photo.jpg.exe', '../photo.jpg', 'C:\\photo.jpg', 'CON.jpg'])(
    'rejects unsafe or mismatched filename %s',
    (filename) => {
        expect(() =>
            validateUploadFile({ filename, mimeType: 'image/jpeg', fileSize: 100 }, validateUploadEnvironment({})),
        ).toThrow();
    },
);
it('signs the registered file length and rejects foreign staging keys', async () => {
    const { service, storage, files } = fixture();
    const session = await service.createSession();
    const file = await service.registerFile(session.id, {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100,
    });
    await service.presign(file.id);
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledWith(expect.objectContaining({ contentLength: 100 }));
    files.get(file.id).storageKey = 'media/another/original.jpg';
    storage.getObjectMetadata.mockClear();
    await expect(service.complete(file.id)).rejects.toThrow();
    expect(storage.getObjectMetadata).not.toHaveBeenCalled();
});

it('projects presign responses without provider secrets', async () => {
    const { service, storage } = fixture();
    const session = await service.createSession();
    const file = await service.registerFile(session.id, {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100,
    });
    storage.createPresignedUploadUrl.mockResolvedValue({
        url: 'https://storage.test',
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        expiresIn: 900,
        secretAccessKey: 'secret',
    });
    expect(await service.presign(file.id)).not.toHaveProperty('secretAccessKey');
});
