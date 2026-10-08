import { Readable } from 'node:stream';

import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { StorageError, StorageProvider } from '../storageProvider.js';
import { validateContentType, validateExpiry, validateKey } from '../storageValidation.js';
import { createS3Clients } from './s3Client.js';

export class S3StorageProvider extends StorageProvider {
    #client;
    #signingClient;
    #sign;
    #bucket;
    #closed = false;

    constructor(config, dependencies) {
        super();
        const { client, signingClient, sign = getSignedUrl } = dependencies ?? createS3Clients(config);
        this.#client = client;
        this.#signingClient = signingClient;
        this.#sign = sign;
        this.#bucket = config.bucket;
    }
    #ensureOpen() {
        if (this.#closed) throw new Error('Storage provider is closed');
    }
    async #send(operation, command, allowMissing = false) {
        this.#ensureOpen();
        try {
            return await this.#client.send(command);
        } catch (error) {
            if (allowMissing && ['NotFound', 'NoSuchKey'].includes(error.name)) return null;
            // No raw vendor error/cause: it can contain signed URLs or credentials.
            throw new StorageError(operation);
        }
    }
    async upload({ key, body, contentType, contentLength, metadata = {} }) {
        validateKey(key);
        validateContentType(contentType);
        if (!(typeof body === 'string' || body instanceof Uint8Array || body instanceof Readable))
            throw new TypeError('Invalid storage upload body');
        const measuredLength =
            typeof body === 'string'
                ? Buffer.byteLength(body)
                : body instanceof Uint8Array
                  ? body.byteLength
                  : undefined;
        if (measuredLength !== undefined && contentLength !== undefined && measuredLength !== contentLength) {
            throw new TypeError('Invalid storage content length');
        }
        contentLength ??= measuredLength;
        if (
            (body instanceof Readable && contentLength === undefined) ||
            (contentLength !== undefined &&
                (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > 5 * 1024 ** 3))
        )
            throw new TypeError('Invalid storage content length');
        if (
            metadata === null ||
            typeof metadata !== 'object' ||
            Array.isArray(metadata) ||
            !Object.entries(metadata).every(
                ([name, value]) => /^[a-z0-9_-]+$/.test(name) && typeof value === 'string' && !/[\r\n\0]/.test(value),
            )
        )
            throw new TypeError('Invalid storage object metadata');
        const result = await this.#send(
            'upload',
            new PutObjectCommand({
                Bucket: this.#bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
                ContentLength: contentLength,
                Metadata: metadata,
            }),
        );
        return { key, etag: result.ETag ?? null };
    }
    async delete({ key }) {
        await this.#send('delete', new DeleteObjectCommand({ Bucket: this.#bucket, Key: validateKey(key) }));
    }
    async getObjectMetadata({ key }) {
        const result = await this.#send(
            'metadata',
            new HeadObjectCommand({ Bucket: this.#bucket, Key: validateKey(key) }),
            true,
        );
        if (result === null) return null;
        return {
            key,
            fileSize: result.ContentLength ?? null,
            contentType: result.ContentType ?? null,
            etag: result.ETag ?? null,
            lastModified: result.LastModified ?? null,
            metadata: result.Metadata ?? {},
        };
    }
    async exists(options) {
        return (await this.getObjectMetadata(options)) !== null;
    }
    async #presign(command, method, headers, expiresIn) {
        this.#ensureOpen();
        const expiry = validateExpiry(expiresIn);
        try {
            const url = await this.#sign(this.#signingClient, command, {
                expiresIn: expiry,
                signableHeaders: new Set(Object.keys(headers)),
            });
            return { url, method, headers, expiresIn: expiry };
        } catch {
            throw new StorageError('signing');
        }
    }
    async createPresignedUploadUrl({ key, contentType, expiresIn }) {
        validateContentType(contentType);
        return this.#presign(
            new PutObjectCommand({ Bucket: this.#bucket, Key: validateKey(key), ContentType: contentType }),
            'PUT',
            { 'content-type': contentType },
            expiresIn,
        );
    }
    async createPresignedDownloadUrl({ key, expiresIn, method = 'GET' }) {
        if (!['GET', 'HEAD'].includes(method)) throw new TypeError('Invalid storage download method');
        const Command = method === 'GET' ? GetObjectCommand : HeadObjectCommand;
        return this.#presign(new Command({ Bucket: this.#bucket, Key: validateKey(key) }), method, {}, expiresIn);
    }
    async copyObject({ sourceKey, destinationKey, sourceEtag }) {
        validateKey(sourceKey);
        validateKey(destinationKey);
        if (sourceKey === destinationKey) throw new TypeError('Storage copy requires a different destination');
        if (sourceEtag !== undefined && (typeof sourceEtag !== 'string' || !sourceEtag || /[\r\n\0]/.test(sourceEtag)))
            throw new TypeError('Invalid source ETag');
        const source = `${this.#bucket}/${sourceKey}`
            .split('/')
            .map((part) => encodeURIComponent(part))
            .join('/');
        const result = await this.#send(
            'copy',
            new CopyObjectCommand({
                Bucket: this.#bucket,
                Key: destinationKey,
                CopySource: source,
                ...(sourceEtag === undefined ? {} : { CopySourceIfMatch: sourceEtag }),
            }),
        );
        return { key: destinationKey, etag: result.CopyObjectResult?.ETag ?? null };
    }
    close() {
        if (this.#closed) return;
        this.#closed = true;
        this.#client.destroy();
        if (this.#signingClient !== this.#client) this.#signingClient.destroy();
    }
}
