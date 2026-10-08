import { S3Client } from '@aws-sdk/client-s3';

export function createS3Clients(config) {
    const options = {
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        // Avoid optional automatic CRC/chunked checksums unsupported by some S3 emulators.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    };
    return {
        client: new S3Client({ ...options, endpoint: config.endpoint }),
        signingClient: new S3Client({ ...options, endpoint: config.publicEndpoint }),
    };
}
