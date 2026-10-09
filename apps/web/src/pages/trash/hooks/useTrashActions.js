import { useRef, useState } from 'react';

import { usePermanentDeleteMedia, useRestoreMedia } from '@/features/trash/index.js';

/** Snapshot operations and clear only successful IDs so failures can be retried. */
export function useTrashActions(selection, items) {
  const restore = useRestoreMedia();
  const permanentDelete = usePermanentDeleteMedia();
  const lock = useRef(false);
  const confirmationIds = useRef(null);
  const [isBusy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const restoreAllowed =
    selection.selectedCount > 0 &&
    selection.selectedIds.every((id) =>
      items.some((item) => item.id === id && item.canRestore === true),
    );
  const isLocked = () => lock.current || confirmationIds.current !== null;

  async function run(ids, action, label) {
    if (lock.current || !ids.length) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let completed = 0;
    const failures = [];
    const failedIds = [];
    try {
      for (const id of ids) {
        try {
          await action(id);
          selection.deselect(id);
          completed++;
        } catch (failure) {
          failures.push(failure);
          failedIds.push(id);
        }
      }
      setNotice(
        `${label}: ${completed} succeeded${failures.length ? `, ${failures.length} failed` : ''}.`,
      );
      if (failures.length) setError(failures[0].message);
      return failedIds;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return {
    isBusy,
    isLocked,
    selectionLocked: isBusy || confirmation !== null,
    confirmationCount: confirmation?.length ?? 0,
    restoreAllowed,
    error,
    notice,
    restoreSelected: () => {
      if (!isLocked() && restoreAllowed)
        run([...selection.selectedIds], restore.mutateAsync, 'Restore');
    },
    requestPermanentDelete: () => {
      if (isLocked() || !selection.selectedCount) return;
      setError('');
      const ids = [...selection.selectedIds];
      confirmationIds.current = ids;
      setConfirmation(ids);
    },
    cancelPermanentDelete: () => {
      if (lock.current) return;
      confirmationIds.current = null;
      setConfirmation(null);
    },
    confirmPermanentDelete: async () => {
      const ids = confirmationIds.current;
      if (lock.current || !ids) return;
      const failedIds = await run(
        ids,
        (mediaId) => permanentDelete.mutateAsync({ mediaId, confirm: true }),
        'Permanent delete',
      );
      confirmationIds.current = failedIds.length ? failedIds : null;
      setConfirmation(confirmationIds.current);
    },
  };
}
