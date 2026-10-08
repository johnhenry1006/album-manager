import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import {
  useFileUpload,
  useUploadProgress,
  useUploadSession,
  validateUploadFile,
} from '../index.js';

const clients = [];
let requests;
let transfers;
let remoteStatus;
let completeFailures;
let putFailure;
let holdPut;
let resolutionFailures;
const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
const metadata = () => ({
  uploadFileId: 'f',
  sessionId: 's',
  status: remoteStatus,
  filename: file.name,
  mimeType: file.type,
  fileSize: '5',
  mediaId:
    remoteStatus === 'READY'
      ? 'final'
      : ['REGISTERED', 'UPLOADING'].includes(remoteStatus)
        ? null
        : 'temporary',
  createdAt: '2026-10-08T00:00:00.000Z',
  updatedAt: '2026-10-08T00:00:00.000Z',
});
function respond(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup() {
  const client = createQueryClient();
  clients.push(client);
  return { wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children) };
}
beforeEach(() => {
  requests = [];
  transfers = [];
  remoteStatus = 'REGISTERED';
  completeFailures = 0;
  putFailure = false;
  holdPut = false;
  resolutionFailures = 0;
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url, 'http://localhost');
    const body = options.body && JSON.parse(options.body);
    requests.push({ path: path.pathname, search: path.search, body, signal: options.signal });
    if (path.pathname.endsWith('/duplicate/resolve')) {
      if (resolutionFailures-- > 0)
        return respond({ error: 'UNAVAILABLE', message: 'Try again' }, 503);
      remoteStatus =
        body.action === 'SKIP' ? 'CANCELLED' : body.action === 'KEEP_BOTH' ? 'PROCESSING' : 'READY';
      return respond({
        uploadFileId: 'f',
        status: remoteStatus,
        finalMediaId: remoteStatus === 'READY' ? 'existing' : null,
      });
    }
    if (path.pathname.endsWith('/presign')) {
      remoteStatus = 'UPLOADING';
      return respond({
        uploadFileId: 'f',
        status: remoteStatus,
        url: 'https://storage.example/signed',
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg', 'x-amz-test': 'signed' },
        expiresIn: 900,
      });
    }
    if (path.pathname.endsWith('/complete')) {
      if (completeFailures-- > 0)
        return respond({ error: 'UNAVAILABLE', message: 'Try again' }, 503);
      remoteStatus = 'PROCESSING';
      return respond({ uploadFileId: 'f', status: remoteStatus, mediaId: 'temporary' }, 202);
    }
    if (path.pathname.endsWith('/files')) return respond(metadata(), 201);
    if (options.method === 'POST') return respond({ sessionId: 's', status: 'PENDING' }, 201);
    // The tracked file is on the second page, including during reconciliation.
    return respond({
      sessionId: 's',
      status: 'PROCESSING',
      files: path.searchParams.has('cursor') ? [metadata()] : [],
      nextCursor: path.searchParams.has('cursor') ? null : 'next+/=',
    });
  });
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      upload = {};
      headers = {};
      status = 200;
      open(method, url) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(name, value) {
        this.headers[name] = value;
      }
      send(body) {
        transfers.push({
          method: this.method,
          url: this.url,
          headers: this.headers,
          body,
          xhr: this,
        });
        if (holdPut) return;
        this.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 5 });
        queueMicrotask(() => (putFailure ? this.onerror?.() : this.onload?.()));
      }
      abort() {
        this.aborted = true;
        this.onabort?.();
      }
    },
  );
});
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

it('rejects empty, oversized and unsupported files before creating remote state', async () => {
  expect(validateUploadFile(file).valid).toBe(true);
  expect(validateUploadFile(file, { maxFileSize: 4 }).valid).toBe(false);
  expect(validateUploadFile(new File([], 'empty.jpg', { type: 'image/jpeg' })).valid).toBe(false);
  const { result } = renderHook(() => useFileUpload(), setup());
  await act(async () => {
    await expect(
      result.current.upload(new File(['x'], 'bad.txt', { type: 'text/plain' })),
    ).rejects.toMatchObject({ code: 'INVALID_UPLOAD_FILE' });
  });
  expect(requests).toEqual([]);
});

it('uploads raw bytes directly, exposes processing and returns only the final READY identity', async () => {
  const { result } = renderHook(() => {
    const upload = useFileUpload({ pollInterval: 5 });
    return { ...upload, progress: useUploadProgress(upload) };
  }, setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  expect(result.current.finalMediaId).toBeNull();
  expect(result.current.progress.percent).toBe(100);
  expect(transfers[0]).toMatchObject({
    method: 'PUT',
    url: 'https://storage.example/signed',
    body: file,
    headers: { 'Content-Type': 'image/jpeg', 'x-amz-test': 'signed' },
  });
  expect(requests.find(({ path }) => path.endsWith('/files')).body).toEqual({
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 5,
  });
  remoteStatus = 'READY';
  await act(async () => expect(await done).toBe('final'));
  expect(result.current.finalMediaId).toBe('final');
  expect(requests.some(({ search }) => search.includes('next%2B%2F%3D'))).toBe(true);
});

it('retries completion without resending bytes or registering another file', async () => {
  completeFailures = 1;
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  await act(async () => {
    await expect(result.current.upload(file)).rejects.toMatchObject({ status: 503 });
  });
  expect(result.current.canRetry).toBe(true);
  let done;
  act(() => {
    done = result.current.retry();
  });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'READY';
  await act(async () => expect(await done).toBe('final'));
  expect(transfers).toHaveLength(1);
  expect(requests.filter(({ path }) => path.endsWith('/files'))).toHaveLength(1);
});

it('requests a fresh signed URL when retrying failed storage transfer', async () => {
  putFailure = true;
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  await act(async () => {
    await expect(result.current.upload(file)).rejects.toMatchObject({
      code: 'UPLOAD_NETWORK_ERROR',
    });
  });
  putFailure = false;
  let done;
  act(() => {
    done = result.current.retry();
  });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'READY';
  await act(async () => expect(await done).toBe('final'));
  expect(requests.filter(({ path }) => path.endsWith('/presign'))).toHaveLength(2);
  expect(requests.filter(({ path }) => path.endsWith('/files'))).toHaveLength(1);
});

it.each([
  ['SKIP', null, 'CANCELLED'],
  ['USE_EXISTING', 'existing', 'READY'],
  ['KEEP_BOTH', 'final', 'READY'],
])(
  'resolves %s and settles the original upload with its final media ID',
  async (action, expected, status) => {
    const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
    let done;
    act(() => {
      done = result.current.upload(file);
    });
    await waitFor(() => expect(result.current.isProcessing).toBe(true));
    remoteStatus = 'DUPLICATE_PENDING';
    await waitFor(() => expect(result.current.needsDuplicateResolution).toBe(true));
    expect(result.current.duplicateActions).toEqual(['SKIP', 'USE_EXISTING', 'KEEP_BOTH']);
    let resolution;
    act(() => {
      resolution = result.current.resolveDuplicate(action);
    });
    if (action === 'KEEP_BOTH') {
      await waitFor(() => expect(result.current.isProcessing).toBe(true));
      remoteStatus = 'READY';
    }
    await act(async () => {
      expect(await done).toBe(expected);
      expect(await resolution).toBe(expected);
    });
    expect(result.current.status).toBe(status);
    if (action === 'SKIP') expect(result.current.mediaId).toBeNull();
  },
);

it('retains a failed duplicate choice for retry without restarting transfer', async () => {
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  // Attach rejection handling before triggering the remote failure.
  const failure = expect(done).rejects.toMatchObject({ status: 503 });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'DUPLICATE_PENDING';
  await waitFor(() => expect(result.current.needsDuplicateResolution).toBe(true));
  resolutionFailures = 1;
  await act(async () => {
    await expect(result.current.resolveDuplicate('USE_EXISTING')).rejects.toMatchObject({
      status: 503,
    });
    await failure;
  });
  await act(async () => expect(await result.current.retry()).toBe('existing'));
  expect(transfers).toHaveLength(1);
});

it('cancels the active PUT and does not notify completion', async () => {
  holdPut = true;
  const { result } = renderHook(() => useFileUpload(), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const failure = expect(done).rejects.toMatchObject({ name: 'AbortError' });
  await waitFor(() => expect(transfers).toHaveLength(1));
  await act(async () => {
    result.current.cancel();
    await failure;
  });
  expect(transfers[0].xhr.aborted).toBe(true);
  expect(requests.some(({ path }) => path.endsWith('/complete'))).toBe(false);
  expect(result.current.status).toBe('CANCELLED');
});

it('stops on backend FAILED without reporting the temporary media as final', async () => {
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const failure = expect(done).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'FAILED';
  await act(async () => {
    await failure;
  });
  expect(result.current.finalMediaId).toBeNull();
  expect(result.current.canRetry).toBe(false);
});

it('allows batch registration before transfer through the public session hook', async () => {
  const { result } = renderHook(() => useUploadSession(), setup());
  await act(async () => {
    await result.current.createSession.mutateAsync();
  });
  await act(async () => {
    await result.current.registerFile.mutateAsync({ file });
  });
  expect(result.current.sessionId).toBe('s');
  expect(requests.filter(({ path }) => path.endsWith('/files'))).toHaveLength(1);
  expect(transfers).toEqual([]);
});

it('shows real byte progress while transferring without declaring processing complete', async () => {
  holdPut = true;
  const { result } = renderHook(() => {
    const upload = useFileUpload({ pollInterval: 5 });
    return { ...upload, progress: useUploadProgress(upload) };
  }, setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  await waitFor(() => expect(transfers).toHaveLength(1));
  act(() => transfers[0].xhr.upload.onprogress({ lengthComputable: true, loaded: 2, total: 5 }));
  expect(result.current.progress.percent).toBe(40);
  expect(result.current.finalMediaId).toBeNull();
  act(() => transfers[0].xhr.onload());
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'READY';
  await act(async () => {
    await done;
  });
});

it('supports direct fetch fallback with indeterminate progress and no credentials', async () => {
  vi.stubGlobal('XMLHttpRequest', undefined);
  const metadataFetch = globalThis.fetch;
  let storageRequest;
  vi.stubGlobal('fetch', async (url, options) => {
    if (url === 'https://storage.example/signed') {
      storageRequest = options;
      return new Response(null, { status: 204 });
    }
    return metadataFetch(url, options);
  });
  const { result } = renderHook(() => {
    const upload = useFileUpload({ pollInterval: 5 });
    return { ...upload, progress: useUploadProgress(upload) };
  }, setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  expect(storageRequest).toMatchObject({ method: 'PUT', body: file, credentials: 'omit' });
  expect(result.current.progress.percent).toBeNull();
  expect(result.current.progress.isIndeterminate).toBe(true);
  remoteStatus = 'READY';
  await act(async () => {
    await done;
  });
});

it('rejects invalid remote states instead of polling forever', async () => {
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const failure = expect(done).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'BROKEN';
  await act(async () => {
    await failure;
  });
});

it('rejects a different file when resuming registered metadata', async () => {
  const { result } = renderHook(() => useFileUpload(), setup());
  await act(async () => {
    await expect(
      result.current.upload(new File(['different'], 'different.jpg', { type: 'image/jpeg' }), {
        sessionId: 's',
        uploadFileId: 'f',
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_FILE_MISMATCH' });
  });
  expect(transfers).toEqual([]);
});

it('aborts a pending tracking request when unmounted', async () => {
  const metadataFetch = globalThis.fetch;
  let trackingSignal;
  vi.stubGlobal('fetch', (url, options) => {
    if (options.method === 'GET') {
      trackingSignal = options.signal;
      return new Promise((_resolve, reject) =>
        trackingSignal.addEventListener('abort', () => reject(trackingSignal.reason), {
          once: true,
        }),
      );
    }
    return metadataFetch(url, options);
  });
  const { result, unmount } = renderHook(() => useFileUpload({ pollInterval: 1 }), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const failure = expect(done).rejects.toMatchObject({ name: 'AbortError' });
  await waitFor(() => expect(trackingSignal).toBeInstanceOf(AbortSignal));
  unmount();
  await failure;
  expect(trackingSignal.aborted).toBe(true);
});

it('retries tracking after an API outage without repeating completion', async () => {
  const metadataFetch = globalThis.fetch;
  let failed = false;
  vi.stubGlobal('fetch', async (url, options) => {
    if (options.method === 'GET' && !failed) {
      failed = true;
      return respond({ error: 'UNAVAILABLE', message: 'Try again' }, 503);
    }
    return metadataFetch(url, options);
  });
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  await act(async () => {
    await expect(result.current.upload(file)).rejects.toMatchObject({ status: 503 });
  });
  remoteStatus = 'READY';
  await act(async () => expect(await result.current.retry()).toBe('final'));
  expect(transfers).toHaveLength(1);
  expect(requests.filter(({ path }) => path.endsWith('/complete'))).toHaveLength(1);
});

it('reconciles a lost completion response before deciding whether to resend bytes', async () => {
  const metadataFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, options) => {
    const response = await metadataFetch(url, options);
    if (url.endsWith('/complete'))
      throw new TypeError('Connection lost after API accepted completion');
    return response;
  });
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  await act(async () => {
    await expect(result.current.upload(file)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
  remoteStatus = 'READY';
  await act(async () => expect(await result.current.retry()).toBe('final'));
  expect(transfers).toHaveLength(1);
  expect(requests.filter(({ path }) => path.endsWith('/complete'))).toHaveLength(1);
});

it('does not offer duplicate actions after a resolution request has failed', async () => {
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const failure = expect(done).rejects.toMatchObject({ status: 503 });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'DUPLICATE_PENDING';
  await waitFor(() => expect(result.current.needsDuplicateResolution).toBe(true));
  resolutionFailures = 1;
  await act(async () => {
    await expect(result.current.resolveDuplicate('SKIP')).rejects.toMatchObject({ status: 503 });
    await failure;
  });
  expect(result.current.needsDuplicateResolution).toBe(false);
  expect(result.current.canRetry).toBe(true);
});

it('does not report a temporary ID when READY metadata omits the final identity', async () => {
  const metadataFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, options) => {
    const response = await metadataFetch(url, options);
    if (options.method === 'GET' && remoteStatus === 'READY') {
      const session = await response.json();
      return respond({
        ...session,
        files: session.files.map((item) => ({ ...item, mediaId: null })),
      });
    }
    return response;
  });
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const failure = expect(done).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'READY';
  await act(async () => {
    await failure;
  });
  expect(result.current.finalMediaId).toBeNull();
});

it('resumes filenames normalized by the backend rather than rejecting accepted Unicode', async () => {
  const unicodeFile = new File(['photo'], 'cafe\u0301.jpg', { type: 'image/jpeg' });
  const metadataFetch = globalThis.fetch;
  remoteStatus = 'READY';
  vi.stubGlobal('fetch', async (url, options) => {
    const response = await metadataFetch(url, options);
    const session = await response.json();
    return respond({
      ...session,
      files: session.files.map((item) => ({ ...item, filename: 'café.jpg' })),
    });
  });
  const { result } = renderHook(() => useFileUpload(), setup());
  await act(async () =>
    expect(await result.current.upload(unicodeFile, { sessionId: 's', uploadFileId: 'f' })).toBe(
      'final',
    ),
  );
  expect(transfers).toEqual([]);
});

it('cancels a duplicate wait without sending a resolution and can resume that decision', async () => {
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const cancelled = expect(done).rejects.toMatchObject({ name: 'AbortError' });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'DUPLICATE_PENDING';
  await waitFor(() => expect(result.current.needsDuplicateResolution).toBe(true));
  await act(async () => {
    result.current.cancel();
    await cancelled;
  });
  expect(requests.some(({ path }) => path.endsWith('/duplicate/resolve'))).toBe(false);
  act(() => {
    done = result.current.retry();
  });
  await waitFor(() => expect(result.current.needsDuplicateResolution).toBe(true));
  await act(async () => {
    expect(await result.current.resolveDuplicate('USE_EXISTING')).toBe('existing');
    expect(await done).toBe('existing');
  });
  expect(transfers).toHaveLength(1);
});

it('aborts pending session creation without registering a file or transferring bytes', async () => {
  let signal;
  vi.stubGlobal('fetch', (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  });
  const { result } = renderHook(() => useFileUpload(), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const cancelled = expect(done).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => {
    result.current.cancel();
    await cancelled;
  });
  expect(signal.aborted).toBe(true);
  expect(result.current.uploadFileId).toBeNull();
  expect(transfers).toEqual([]);
});

it('reconciles a duplicate resolution whose success response was lost', async () => {
  const metadataFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, options) => {
    const response = await metadataFetch(url, options);
    if (url.endsWith('/duplicate/resolve'))
      throw new TypeError('Connection lost after resolution succeeded');
    if (options.method === 'GET' && remoteStatus === 'READY') {
      const session = await response.json();
      return respond({
        ...session,
        files: session.files.map((item) => ({ ...item, mediaId: 'existing' })),
      });
    }
    return response;
  });
  const { result } = renderHook(() => useFileUpload({ pollInterval: 5 }), setup());
  let done;
  act(() => {
    done = result.current.upload(file);
  });
  const failure = expect(done).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  await waitFor(() => expect(result.current.isProcessing).toBe(true));
  remoteStatus = 'DUPLICATE_PENDING';
  await waitFor(() => expect(result.current.needsDuplicateResolution).toBe(true));
  await act(async () => {
    await expect(result.current.resolveDuplicate('USE_EXISTING')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    await failure;
  });
  await act(async () => expect(await result.current.retry()).toBe('existing'));
  expect(requests.filter(({ path }) => path.endsWith('/duplicate/resolve'))).toHaveLength(1);
  expect(transfers).toHaveLength(1);
});
