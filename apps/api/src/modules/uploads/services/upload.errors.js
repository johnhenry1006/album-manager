export class UploadError extends Error {
    constructor(code, message, statusCode) {
        super(message);
        this.name = 'UploadError';
        this.code = code;
        this.statusCode = statusCode;
    }
}
export function invalidUpload(message = 'Invalid upload input') {
    const error = new UploadError('INVALID_UPLOAD_INPUT', message, 400);
    error.validation = true;
    return error;
}
export function uploadNotFound() {
    return new UploadError('UPLOAD_NOT_FOUND', 'Upload not found', 404);
}
export function uploadConflict() {
    return new UploadError('UPLOAD_STATE_CONFLICT', 'Upload cannot perform this operation', 409);
}
