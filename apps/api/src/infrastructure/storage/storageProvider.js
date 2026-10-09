// Vendor-neutral contract. Operations accept objects; see STORAGE.md for shapes.
export class StorageProvider {
    getProviderMetadata() {
        return { providerType: null, endpointHost: null, bucketName: null };
    }
    async read(_options) {
        throw new Error('Storage reading is not implemented');
    }
    async upload(_options) {
        throw new Error('Storage upload is not implemented');
    }
    async delete(_options) {
        throw new Error('Storage delete is not implemented');
    }
    async exists(_options) {
        throw new Error('Storage exists is not implemented');
    }
    async getObjectMetadata(_options) {
        throw new Error('Storage metadata is not implemented');
    }
    async createPresignedUploadUrl(_options) {
        throw new Error('Storage upload signing is not implemented');
    }
    async createPresignedDownloadUrl(_options) {
        throw new Error('Storage download signing is not implemented');
    }
    async copyObject(_options) {
        throw new Error('Storage copy is not implemented');
    }
    close() {
        throw new Error('Storage close is not implemented');
    }
}
export class StorageError extends Error {
    constructor(operation) {
        super(`Storage ${operation} failed`);
        this.name = 'StorageError';
        this.code = 'STORAGE_ERROR';
        this.operation = operation;
    }
}
