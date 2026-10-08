import { describe, expect, it, vi } from 'vitest';

import { validateStorageEnvironment } from '#config/storage.js';

import { createStorageProvider } from '../storageFactory.js';
import { StorageError, StorageProvider } from '../storageProvider.js';
import { createS3Clients } from './s3Client.js';
import { S3StorageProvider } from './s3StorageProvider.js';

const config = validateStorageEnvironment({
    S3_ENDPOINT: 'http://internal:9000',
    S3_PUBLIC_ENDPOINT: 'https://media.example.com',
    S3_BUCKET: 'album-manager',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'private-secret',
});
function setup() {
    const client = { send: vi.fn().mockResolvedValue({}), destroy: vi.fn() };
    const signingClient = { destroy: vi.fn() };
    const sign = vi.fn().mockResolvedValue('https://signed.example.com');
    return { client, signingClient, sign, provider: new S3StorageProvider(config, { client, signingClient, sign }) };
}

describe('S3 storage adapter', () => {
    it('uploads with server-only bucket settings and returns a neutral result', async () => {
        const { provider, client } = setup();
        client.send.mockResolvedValue({ ETag: 'etag' });
        expect(
            await provider.upload({ key: 'media/a.jpg', body: Buffer.from('data'), contentType: 'image/jpeg' }),
        ).toEqual({ key: 'media/a.jpg', etag: 'etag' });
        expect(client.send.mock.calls[0][0].input).toMatchObject({
            Bucket: 'album-manager',
            Key: 'media/a.jpg',
            ContentType: 'image/jpeg',
        });
        expect(provider).toBeInstanceOf(StorageProvider);
    });
    it('maps metadata and missing objects without swallowing permission errors', async () => {
        const { provider, client } = setup();
        client.send.mockResolvedValue({
            ContentLength: 10,
            ContentType: 'image/jpeg',
            ETag: 'etag',
            Metadata: { purpose: 'original' },
        });
        expect(await provider.getObjectMetadata({ key: 'a' })).toMatchObject({
            key: 'a',
            fileSize: 10,
            contentType: 'image/jpeg',
            metadata: { purpose: 'original' },
        });
        client.send.mockRejectedValue({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });
        expect(await provider.exists({ key: 'missing' })).toBe(false);
        expect(await provider.getObjectMetadata({ key: 'missing' })).toBeNull();
        client.send.mockRejectedValue({
            name: 'AccessDenied',
            message: 'private-secret',
            $metadata: { httpStatusCode: 403 },
        });
        await expect(provider.exists({ key: 'private' })).rejects.toBeInstanceOf(StorageError);
        await expect(provider.upload({ key: 'a', body: 'data', contentType: 'text/plain' })).rejects.not.toThrow(
            'private-secret',
        );
    });
    it('copies an encoded object source and deletes through the operation client', async () => {
        const { provider, client } = setup();
        await provider.copyObject({ sourceKey: 'a folder/a+#.jpg', destinationKey: 'copy.jpg' });
        expect(client.send.mock.calls[0][0].input.CopySource).toBe('album-manager/a%20folder/a%2B%23.jpg');
        await provider.delete({ key: 'copy.jpg' });
        expect(client.send.mock.calls[1][0].input).toEqual({ Bucket: 'album-manager', Key: 'copy.jpg' });
    });
    it('signs upload headers and downloads using the browser client', async () => {
        const { provider, signingClient, sign } = setup();
        expect(await provider.createPresignedUploadUrl({ key: 'a', contentType: 'image/jpeg', expiresIn: 60 })).toEqual(
            {
                url: 'https://signed.example.com',
                method: 'PUT',
                headers: { 'content-type': 'image/jpeg' },
                expiresIn: 60,
            },
        );
        expect(sign.mock.calls[0][0]).toBe(signingClient);
        expect(sign.mock.calls[0][2].signableHeaders.has('content-type')).toBe(true);
        expect((await provider.createPresignedDownloadUrl({ key: 'a', method: 'HEAD' })).method).toBe('HEAD');
    });
    it('signs real URLs against the public endpoint without exposing the secret', async () => {
        const provider = createStorageProvider(config);
        try {
            const result = await provider.createPresignedUploadUrl({ key: 'media/a.jpg', contentType: 'image/jpeg' });
            const url = new URL(result.url);
            expect(url.origin).toBe('https://media.example.com');
            expect(url.pathname).toBe('/album-manager/media/a.jpg');
            expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
            expect(result.url).not.toContain('private-secret');
        } finally {
            provider.close();
        }
    });
    it('creates distinct internal and public clients and closes each once', async () => {
        const clients = createS3Clients(config);
        expect((await clients.client.config.endpoint()).hostname).toBe('internal');
        expect((await clients.signingClient.config.endpoint()).hostname).toBe('media.example.com');
        clients.client.destroy();
        clients.signingClient.destroy();
        const { provider, client, signingClient } = setup();
        provider.close();
        provider.close();
        expect(client.destroy).toHaveBeenCalledTimes(1);
        expect(signingClient.destroy).toHaveBeenCalledTimes(1);
        await expect(provider.exists({ key: 'a' })).rejects.toThrow('Storage provider is closed');
    });
    it('rejects invalid signing input before contacting clients', async () => {
        const { provider, sign } = setup();
        await expect(
            provider.createPresignedUploadUrl({ key: '../escape', contentType: 'image/jpeg' }),
        ).rejects.toThrow(TypeError);
        await expect(provider.createPresignedDownloadUrl({ key: 'a', expiresIn: 604801 })).rejects.toThrow(TypeError);
        await expect(provider.createPresignedDownloadUrl({ key: 'a', method: 'DELETE' })).rejects.toThrow(TypeError);
        expect(sign).not.toHaveBeenCalled();
    });
    it('rejects inconsistent upload lengths and unsafe metadata before sending', async () => {
        const { provider, client } = setup();
        await expect(
            provider.upload({ key: 'a', body: 'data', contentType: 'text/plain', contentLength: 1 }),
        ).rejects.toThrow(TypeError);
        await expect(
            provider.upload({
                key: 'a',
                body: 'data',
                contentType: 'text/plain',
                metadata: { purpose: 'bad\r\nvalue' },
            }),
        ).rejects.toThrow(TypeError);
        expect(client.send).not.toHaveBeenCalled();
    });
});

it('conditionally copies the verified source version into an original key', async () => {
    const { provider, client } = setup();
    await provider.copyObject({
        sourceKey: 'staging/source',
        destinationKey: 'media/original',
        sourceEtag: '"verified"',
    });
    expect(client.send.mock.calls[0][0].input).toMatchObject({ CopySourceIfMatch: '"verified"' });
});
