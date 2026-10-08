import { getUploadProgress } from '../utils/upload.utils.js';

/** Byte progress is distinct from processing completion; unsupported progress stays indeterminate. */
export function useUploadProgress(uploadState) {
  return getUploadProgress(uploadState);
}
