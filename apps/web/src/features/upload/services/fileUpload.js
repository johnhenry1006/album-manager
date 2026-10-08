import { ApiError } from '@/services/apiError.js';

import { uploadApi } from '../api/uploadApi.js';
import { abortableDelay, DUPLICATE_ACTIONS } from '../utils/upload.utils.js';
import { uploadFileMetadata } from '../utils/validateUploadFile.js';

const initialState = () => ({
  status: 'IDLE',
  phase: 'idle',
  sessionId: null,
  uploadFileId: null,
  mediaId: null,
  finalMediaId: null,
  loaded: 0,
  total: 0,
  progressSupported: false,
  error: null,
  isActive: false,
  isActiveResolution: false,
  canRetry: false,
});

/** Owns browser lifecycle checkpoints only. No media relations or page dependencies. */
export function createFileUpload({ queryFile }) {
  let state = initialState();
  let attempt;
  let abortController;
  let running;
  let decision;
  const listeners = new Set();
  const update = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const applyRemote = (remote) => {
    if (!remote)
      throw new ApiError('The upload file was not found in its session.', {
        code: 'UPLOAD_FILE_NOT_FOUND',
      });
    if (
      ![
        'REGISTERED',
        'UPLOADING',
        'PROCESSING',
        'DUPLICATE_PENDING',
        'READY',
        'FAILED',
        'CANCELLED',
      ].includes(remote.status)
    ) {
      throw new ApiError('Invalid upload file state.', { code: 'INVALID_RESPONSE' });
    }
    const readyMediaId = remote.finalMediaId ?? remote.mediaId;
    if (remote.status === 'READY' && (typeof readyMediaId !== 'string' || !readyMediaId.trim())) {
      throw new ApiError('Ready upload has no media ID.', { code: 'INVALID_RESPONSE' });
    }
    update({
      status: remote.status,
      mediaId:
        remote.status === 'CANCELLED'
          ? null
          : remote.status === 'READY'
            ? readyMediaId
            : (remote.mediaId ?? state.mediaId),
    });
  };

  async function waitForDecision(signal) {
    if (attempt.action) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        decision = null;
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      decision = () => {
        cleanup();
        resolve();
      };
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  async function track(signal) {
    while (true) {
      signal.throwIfAborted();
      if (state.status === 'READY') {
        const id = state.finalMediaId ?? state.mediaId;
        if (!id) throw new ApiError('Ready upload has no media ID.', { code: 'INVALID_RESPONSE' });
        update({ finalMediaId: id, phase: 'complete' });
        return id;
      }
      if (state.status === 'CANCELLED') {
        update({ finalMediaId: null, phase: 'complete' });
        return null;
      }
      if (state.status === 'FAILED')
        throw new ApiError('Media processing failed.', { code: 'UPLOAD_FAILED' });
      if (state.status === 'DUPLICATE_PENDING') {
        update({ phase: 'duplicate' });
        await waitForDecision(signal);
        signal.throwIfAborted();
        update({ isActiveResolution: true });
        const result = await uploadApi.resolveDuplicate(state.uploadFileId, attempt.action, {
          signal,
        });
        signal.throwIfAborted();
        attempt.action = null;
        applyRemote(result);
        update({
          finalMediaId: result.status === 'READY' ? result.finalMediaId : null,
          isActiveResolution: false,
        });
        continue;
      }
      update({ phase: 'processing' });
      await abortableDelay(attempt.pollInterval, signal);
      applyRemote(await queryFile(state.sessionId, state.uploadFileId, signal));
    }
  }

  async function execute(signal, retrying) {
    const metadata = uploadFileMetadata(attempt.file, attempt.policy);
    if (retrying && state.uploadFileId) {
      const remote = await queryFile(state.sessionId, state.uploadFileId, signal);
      applyRemote(remote);
      if (
        remote.filename !== metadata.filename ||
        remote.mimeType !== metadata.mimeType ||
        String(remote.fileSize) !== String(metadata.fileSize)
      ) {
        throw new ApiError('The selected file does not match the registered upload.', {
          code: 'UPLOAD_FILE_MISMATCH',
        });
      }
      // Completion may have succeeded even if its HTTP response was lost.
      if (
        ['PROCESSING', 'DUPLICATE_PENDING', 'READY', 'FAILED', 'CANCELLED'].includes(state.status)
      )
        attempt.completed = true;
      if (state.mediaId) attempt.transferred = true;
    }
    if (!state.sessionId) {
      update({ phase: 'creating-session' });
      const session = await uploadApi.createSession({ signal });
      signal.throwIfAborted();
      update({ sessionId: session.sessionId });
    }
    if (!state.uploadFileId) {
      update({ phase: 'registering' });
      const registered = await uploadApi.registerFile(state.sessionId, metadata, { signal });
      signal.throwIfAborted();
      update({ uploadFileId: registered.uploadFileId, status: registered.status });
    }
    if (!attempt.completed) {
      if (!attempt.transferred) {
        update({ phase: 'presigning' });
        const signed = await uploadApi.presign(state.uploadFileId, { signal });
        signal.throwIfAborted();
        update({ status: 'UPLOADING', phase: 'uploading', loaded: 0, progressSupported: false });
        await uploadApi.uploadToStorage(signed, attempt.file, {
          signal,
          onProgress: (progress) => {
            if (!signal.aborted) update(progress);
          },
        });
        signal.throwIfAborted();
        attempt.transferred = true;
        update({ loaded: attempt.file.size });
      }
      update({ phase: 'completing' });
      const completed = await uploadApi.complete(state.uploadFileId, { signal });
      signal.throwIfAborted();
      attempt.completed = true;
      applyRemote(completed);
    }
    return track(signal);
  }

  function run(retrying = false) {
    abortController = new AbortController();
    const signal = abortController.signal;
    update({ error: null, isActive: true, canRetry: false });
    running = execute(signal, retrying)
      .catch((error) => {
        update({
          error: signal.aborted ? null : error,
          status: signal.aborted ? 'CANCELLED' : state.status,
          phase: signal.aborted ? 'cancelled' : 'error',
          canRetry:
            Boolean(attempt) &&
            !['INVALID_UPLOAD_FILE', 'UPLOAD_FAILED', 'UPLOAD_FILE_MISMATCH'].includes(error?.code),
        });
        throw error;
      })
      .finally(() => {
        running = null;
        update({ isActive: false, isActiveResolution: false });
      });
    return running;
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    upload(file, { sessionId, uploadFileId, policy, pollInterval = 1000 } = {}) {
      if (running)
        return Promise.reject(
          new ApiError('An upload is already active.', { code: 'UPLOAD_BUSY' }),
        );
      if (uploadFileId && !sessionId)
        return Promise.reject(new TypeError('An existing upload file requires its session ID.'));
      attempt = {
        file,
        policy,
        pollInterval: Math.max(1, pollInterval),
        transferred: false,
        completed: false,
        action: null,
      };
      update({
        ...initialState(),
        total: file?.size ?? 0,
        sessionId: sessionId ?? null,
        uploadFileId: uploadFileId ?? null,
      });
      return run(Boolean(uploadFileId));
    },
    retry() {
      if (running) return running;
      if (!state.canRetry)
        return Promise.reject(
          new ApiError('This upload cannot be retried.', { code: 'UPLOAD_NOT_RETRYABLE' }),
        );
      return run(true);
    },
    cancel() {
      if (running) abortController.abort(new DOMException('Upload cancelled.', 'AbortError'));
    },
    resolveDuplicate(action) {
      if (!DUPLICATE_ACTIONS.includes(action))
        return Promise.reject(new TypeError('Invalid duplicate resolution action.'));
      if (!running || state.status !== 'DUPLICATE_PENDING' || !decision) {
        return Promise.reject(
          new ApiError('No duplicate decision is pending.', { code: 'INVALID_UPLOAD_STATE' }),
        );
      }
      attempt.action = action;
      decision();
      return running;
    },
  };
}
