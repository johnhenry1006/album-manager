export const DUPLICATE_ACTIONS = Object.freeze(['SKIP', 'USE_EXISTING', 'KEEP_BOTH']);
export const uploadQueryKeys = {
  all: ['uploads'],
  session: (sessionId) => ['uploads', 'session', sessionId],
};

export function isUploadTerminal(status) {
  return ['READY', 'FAILED', 'CANCELLED'].includes(status);
}

export function getUploadProgress(state) {
  const total = state.total ?? 0;
  const loaded = Math.min(total, Math.max(0, state.loaded ?? 0));
  return {
    loaded,
    total,
    percent: state.progressSupported && total > 0 ? Math.round((loaded / total) * 100) : null,
    isIndeterminate: !state.progressSupported,
    isUploading: state.phase === 'uploading',
    isProcessing: state.status === 'PROCESSING',
    isComplete: state.status === 'READY',
  };
}

export function abortableDelay(milliseconds, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    function abort() {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}
