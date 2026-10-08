import { randomUUID } from 'node:crypto';

import { CreateBucketCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import { expect, it } from 'vitest';

import { loadStorageConfig } from '#config/storage.js';

import { createStorageProvider } from '../storageFactory.js';
import { generateStorageKey } from '../storageKey.js';
import { createS3Clients } from './s3Client.js';

it.skipIf(process.env.STORAGE_TESTS !== '1')(
    'supports the provider contract and browser presigning on local S3',
    async () => {
        const config = { ...loadStorageConfig(), bucket: `storage-test-${randomUUID()}` };
        const clients = createS3Clients(config);
        const provider = createStorageProvider(config);
        const key = generateStorageKey({ id: randomUUID(), createdAt: new Date(), filename: 'test.txt' });
        const copyKey = `${key}.copy`;
        let bucketCreated = false;
        try {
            await clients.client.send(new CreateBucketCommand({ Bucket: config.bucket }));
            bucketCreated = true;
            expect(await provider.exists({ key })).toBe(false);
            await provider.upload({
                key,
                body: 'backend upload',
                contentType: 'text/plain',
                metadata: { purpose: 'test' },
            });
            expect(await provider.getObjectMetadata({ key })).toMatchObject({
                fileSize: 14,
                contentType: 'text/plain',
                metadata: { purpose: 'test' },
            });
            await provider.copyObject({ sourceKey: key, destinationKey: copyKey });
            expect(await provider.exists({ key: copyKey })).toBe(true);
            const upload = await provider.createPresignedUploadUrl({ key, contentType: 'text/plain' });
            const put = await fetch(upload.url, {
                method: upload.method,
                headers: upload.headers,
                body: 'browser upload',
            });
            expect(put.ok).toBe(true);
            const download = await provider.createPresignedDownloadUrl({ key });
            const get = await fetch(download.url, { method: download.method, headers: download.headers });
            expect(get.ok).toBe(true);
            expect(await get.text()).toBe('browser upload');
            const metadata = await provider.createPresignedDownloadUrl({ key, method: 'HEAD' });
            expect((await fetch(metadata.url, { method: metadata.method, headers: metadata.headers })).ok).toBe(true);
            await provider.delete({ key });
            expect(await provider.getObjectMetadata({ key })).toBeNull();
        } finally {
            try {
                if (bucketCreated) {
                    await provider.delete({ key });
                    await provider.delete({ key: copyKey });
                    await clients.client.send(new DeleteBucketCommand({ Bucket: config.bucket }));
                }
            } finally {
                provider.close();
                clients.client.destroy();
                clients.signingClient.destroy();
            }
        }
    },
    20000,
);
