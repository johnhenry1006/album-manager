import { ApiError } from '@/services/apiError.js';

/** Storage transport deliberately bypasses the JSON API client and sends no API credentials. */
export async function uploadToStorage(presigned, file, { signal, onProgress } = {}) {
  signal?.throwIfAborted();
  let url;
  try {
    url = new URL(presigned?.url);
  } catch (cause) {
    throw new ApiError('Invalid storage upload response.', { code: 'INVALID_RESPONSE', cause });
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    presigned.method !== 'PUT'
  ) {
    throw new ApiError('Invalid storage upload response.', { code: 'INVALID_RESPONSE' });
  }
  if (typeof XMLHttpRequest === 'undefined') {
    let response;
    try {
      response = await fetch(presigned.url, {
        method: presigned.method,
        headers: presigned.headers,
        body: file,
        signal,
        credentials: 'omit',
      });
    } catch (cause) {
      if (signal?.aborted) throw signal.reason;
      throw new ApiError('Unable to upload to storage.', { code: 'UPLOAD_NETWORK_ERROR', cause });
    }
    if (!response.ok) throw storageError(response.status);
    return;
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
      if (xhr.upload) xhr.upload.onprogress = null;
    };
    const finish = (error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      xhr.abort();
      finish(signal.reason);
    };
    try {
      xhr.open(presigned.method, presigned.url, true);
      xhr.withCredentials = false;
      xhr.timeout = 15 * 60 * 1000;
      for (const [name, value] of Object.entries(presigned.headers ?? {}))
        xhr.setRequestHeader(name, value);
      if (xhr.upload)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            onProgress?.({ loaded: event.loaded, total: event.total, progressSupported: true });
        };
      xhr.onload = () =>
        finish(xhr.status >= 200 && xhr.status < 300 ? null : storageError(xhr.status));
      xhr.onerror = () =>
        finish(new ApiError('Unable to upload to storage.', { code: 'UPLOAD_NETWORK_ERROR' }));
      xhr.ontimeout = () =>
        finish(new ApiError('Storage upload timed out.', { code: 'UPLOAD_TIMEOUT' }));
      xhr.onabort = () =>
        finish(signal?.reason ?? new DOMException('Upload cancelled.', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      xhr.send(file);
    } catch (cause) {
      finish(
        new ApiError('Unable to start storage upload.', { code: 'UPLOAD_NETWORK_ERROR', cause }),
      );
    }
  });
}

function storageError(status) {
  return new ApiError(`Storage upload failed (${status}).`, {
    status,
    code: 'UPLOAD_STORAGE_ERROR',
  });
}
