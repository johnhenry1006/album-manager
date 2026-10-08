import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { DUPLICATE_ACTIONS, getUploadProgress } from '../utils/upload.utils.js';
import { useUploadControllerFactory } from './useUploadControllerFactory.js';

/** Dynamic independent lifecycles, keyed by consumer IDs. Scheduling and relations stay with consumers. */
export function useFileUploads({ pollInterval = 1000, policy } = {}) {
  const createController = useUploadControllerFactory();
  const manager = useMemo(() => {
    const controllers = new Map();
    const listeners = new Set();
    let snapshots = {};
    function publish(id, controller) {
      const state = controller.getSnapshot();
      snapshots = {
        ...snapshots,
        [id]: {
          ...state,
          progress: getUploadProgress(state),
          needsDuplicateResolution:
            state.status === 'DUPLICATE_PENDING' && state.isActive && !state.isActiveResolution,
          duplicateActions: state.status === 'DUPLICATE_PENDING' ? DUPLICATE_ACTIONS : [],
        },
      };
      listeners.forEach((listener) => listener());
    }
    return {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => snapshots,
      has: (id) => controllers.has(id),
      upload(id, file, options) {
        if (!controllers.has(id)) {
          const controller = createController();
          const unsubscribe = controller.subscribe(() => publish(id, controller));
          controllers.set(id, { controller, unsubscribe });
        }
        return controllers.get(id).controller.upload(file, options);
      },
      retry: (id) => controllers.get(id).controller.retry(),
      resolveDuplicate: (id, action) => controllers.get(id).controller.resolveDuplicate(action),
      cancel: (id) => controllers.get(id)?.controller.cancel(),
      cancelAll: () => controllers.forEach(({ controller }) => controller.cancel()),
      remove(id) {
        const entry = controllers.get(id);
        entry?.unsubscribe();
        entry?.controller.cancel();
        controllers.delete(id);
        const { [id]: _removed, ...remaining } = snapshots;
        snapshots = remaining;
        listeners.forEach((listener) => listener());
      },
    };
  }, [createController]);
  const files = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  useEffect(() => () => manager.cancelAll(), [manager]);
  return {
    ...manager,
    files,
    upload: (id, file, options) => manager.upload(id, file, { ...options, pollInterval, policy }),
  };
}
