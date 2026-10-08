import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { DUPLICATE_ACTIONS } from '../utils/upload.utils.js';
import { useUploadControllerFactory } from './useUploadControllerFactory.js';

/** One reusable file lifecycle. upload/retry/resolveDuplicate settle with the final mediaId (null for SKIP). */
export function useFileUpload({ pollInterval = 1000, policy } = {}) {
  const createController = useUploadControllerFactory();
  const controller = useMemo(createController, [createController]);
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
