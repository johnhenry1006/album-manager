import { useMutation } from '@tanstack/react-query';

import { trashApi } from '../api/trashApi.js';
import { useTrashCacheActions } from './useTrashCacheActions.js';

export function useRestoreMedia() {
  const { refresh } = useTrashCacheActions();
  return useMutation({ mutationFn: trashApi.restore, onSuccess: refresh });
}
