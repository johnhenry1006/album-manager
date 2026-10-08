import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { calculateMediaChecksum, createMediaModule, createMediaService } from '../index.js';

// SHA-256 known-answer vector for the bytes "abc", independent of production hashing.
const checksum = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const id = 'a0000000-0000-4000-8000-000000000001';
const currentId = 'a0000000-0000-4000-8000-000000000002';
function setup(record = null) {
    const repository = { findByChecksum: vi.fn(async () => record) };
    return { service: createMediaService({ repository }), repository };
}

describe('original media checksum', () => {
    it('computes SHA-256 from original bytes without mutating them', async () => {
        const bytes = Buffer.from('abc');
        expect(await calculateMediaChecksum(bytes)).toBe(checksum);
        expect(bytes).toEqual(Buffer.from('abc'));
        expect(await calculateMediaChecksum(new Uint8Array([97, 98, 99]))).toBe(checksum);
    });
    it('hashes a byte stream incrementally regardless of chunk boundaries', async () => {
        const stream = Readable.from([Buffer.from('a'), Buffer.from('bc')]);
        expect(await calculateMediaChecksum(stream)).toBe(checksum);
    });
    it.each(['abc', null, [97, 98, 99], 123])('rejects non-byte input %j', async (input) => {
        await expect(calculateMediaChecksum(input)).rejects.toMatchObject({ code: 'INVALID_MEDIA_INPUT' });
    });
    it('rejects streams containing non-byte chunks', async () => {
        await expect(calculateMediaChecksum(Readable.from(['abc']))).rejects.toMatchObject({
            code: 'INVALID_MEDIA_INPUT',
        });
    });
    it('propagates stream failures instead of accepting a partial digest', async () => {
        async function* failingSource() {
            yield Buffer.from('ab');
            throw new Error('Source read failed');
        }
        await expect(calculateMediaChecksum(failingSource())).rejects.toThrow('Source read failed');
    });
});

describe('media duplicate detection', () => {
    it('returns a NEW_MEDIA domain result with a normalized checksum when no active match exists', async () => {
        const { service, repository } = setup();
        expect(await service.detectDuplicateByChecksum(checksum.toUpperCase())).toEqual({
            type: 'NEW_MEDIA',
            checksum,
        });
        expect(repository.findByChecksum).toHaveBeenCalledWith(checksum, { excludeMediaId: undefined });
    });
    it('returns useful scalar metadata for an active duplicate without persistence relations', async () => {
        const existing = {
            id,
            type: 'IMAGE',
            originalFilename: 'existing.jpg',
            mimeType: 'image/jpeg',
            extension: 'jpg',
            fileSize: 9007199254740993n,
            width: 3000,
            height: 2000,
            aspectRatio: 1.5,
            checksum,
            status: 'READY',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            deletedAt: null,
        };
        const { service } = setup({ ...existing, uploadFiles: [{ private: true }], variants: [{ storageKey: 'x' }] });
        expect(await service.detectDuplicateByChecksum(checksum)).toEqual({
            type: 'DUPLICATE_FOUND',
            existingMediaId: id,
            checksum,
            existingMedia: existing,
        });
    });
    it.each(['PENDING', 'PROCESSING', 'FAILED'])('treats an undeleted %s identity as active', async (status) => {
        expect(
            await setup({ id, checksum, status, deletedAt: null }).service.detectDuplicateByChecksum(checksum),
        ).toMatchObject({ type: 'DUPLICATE_FOUND', existingMediaId: id });
    });
    it('passes a validated exclusion for an already-created upload media item', async () => {
        const { service, repository } = setup();
        expect(await service.detectDuplicateByChecksum(checksum, { excludeMediaId: currentId })).toMatchObject({
            type: 'NEW_MEDIA',
        });
        expect(repository.findByChecksum).toHaveBeenCalledWith(checksum, { excludeMediaId: currentId });
        await expect(service.detectDuplicateByChecksum(checksum, { excludeMediaId: 'bad' })).rejects.toMatchObject({
            code: 'INVALID_MEDIA_INPUT',
        });
        expect(repository.findByChecksum).toHaveBeenCalledTimes(1);
    });
    it.each([null, '', 'a'.repeat(32), 'g'.repeat(64), 'a'.repeat(65)])(
        'rejects malformed SHA-256 checksums %j before lookup',
        async (digest) => {
            const { service, repository } = setup();
            await expect(service.detectDuplicateByChecksum(digest)).rejects.toMatchObject({
                code: 'INVALID_MEDIA_INPUT',
            });
            expect(repository.findByChecksum).not.toHaveBeenCalled();
        },
    );
    it('propagates repository failures instead of returning NEW_MEDIA', async () => {
        const { service, repository } = setup();
        repository.findByChecksum.mockRejectedValue(new Error('Database unavailable'));
        await expect(service.detectDuplicateByChecksum(checksum)).rejects.toThrow('Database unavailable');
    });
    it('exposes detection through the public media module with an active-only repository query', async () => {
        const client = { media: { findUnique: vi.fn(async () => null) } };
        const { mediaService } = createMediaModule(client);
        expect(await mediaService.detectDuplicateByChecksum(checksum)).toEqual({ type: 'NEW_MEDIA', checksum });
        expect(client.media.findUnique).toHaveBeenCalledWith({ where: { checksum, deletedAt: null } });
    });
});
