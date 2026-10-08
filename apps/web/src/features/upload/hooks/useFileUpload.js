import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { uploadApi } from '../api/uploadApi.js';
import { createFileUpload } from '../services/fileUpload.js';
import { DUPLICATE_ACTIONS, uploadQueryKeys } from '../utils/upload.utils.js';

/** One reusable file lifecycle. upload/retry/resolveDuplicate settle with the final mediaId (null for SKIP). */
export function useFileUpload({ pollInterval = 1000, policy } = {}) {
  const client = useQueryClient();
  const controller = useMemo(
    () =>
      createFileUpload({
        queryFile: async (sessionId, uploadFileId, signal) => {
          const session = await client.fetchQuery({
            // File observers must not share a cancellation signal with other active uploads.
            queryKey: [...uploadQueryKeys.session(sessionId), 'file', uploadFileId],
            queryFn: ({ signal: querySignal }) =>
              uploadApi.getSession(sessionId, {
                signal: AbortSignal.any([signal, querySignal]),
              }),
            staleTime: 0,
          });
          signal.throwIfAborted();
          return session.files.find((file) => file.uploadFileId === uploadFileId);
        },
      }),
    [client],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => () => controller.cancel(), [controller]);
  return {
    ...state,
    isProcessing: state.status === 'PROCESSING',
    needsDuplicateResolution:
      state.status === 'DUPLICATE_PENDING' && state.isActive && !state.isActiveResolution,
    duplicateActions: state.status === 'DUPLICATE_PENDING' ? DUPLICATE_ACTIONS : [],
    upload: (file, options) => controller.upload(file, { ...options, pollInterval, policy }),
    retry: controller.retry,
    cancel: controller.cancel,
    resolveDuplicate: controller.resolveDuplicate,
  };
}
