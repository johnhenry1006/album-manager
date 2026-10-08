import { ApiError } from '@/services/apiError.js';

// Advisory defaults only: deployments may pass a stricter policy. The API is authoritative.
export const DEFAULT_UPLOAD_POLICY = Object.freeze({
  maxFileSize: 100 * 1024 ** 2,
  supportedMimeTypes: Object.freeze([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ]),
});

export function validateUploadFile(
  file,
  {
    maxFileSize = DEFAULT_UPLOAD_POLICY.maxFileSize,
    supportedMimeTypes = DEFAULT_UPLOAD_POLICY.supportedMimeTypes,
  } = {},
) {
  let message = null;
  if (!(file instanceof Blob) || typeof file.name !== 'string' || !file.name.trim()) {
    message = 'Select a file to upload.';
  } else if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    message = 'The file must contain data.';
  } else if (file.size > maxFileSize) {
    message = `The file exceeds the ${maxFileSize}-byte upload limit.`;
  } else if (!supportedMimeTypes.includes(file.type.toLowerCase())) {
    message = 'This file type is not supported.';
  }
  return {
    valid: message === null,
    error: message ? new ApiError(message, { code: 'INVALID_UPLOAD_FILE' }) : null,
  };
}

export function uploadFileMetadata(file, policy) {
  const { error } = validateUploadFile(file, policy);
  if (error) throw error;
  return {
    filename: file.name.normalize('NFKC'),
    mimeType: file.type.toLowerCase(),
    fileSize: file.size,
  };
}
