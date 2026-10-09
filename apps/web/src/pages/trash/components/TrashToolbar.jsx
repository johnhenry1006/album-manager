import { ConfirmDialog } from '@/components/common/ConfirmDialog.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

export function TrashToolbar({
  loadedCount,
  selectedCount,
  isBusy,
  selectionLocked,
  restoreAllowed,
  confirmationCount,
  error,
  onSelectLoaded,
  onClearSelection,
  onRestore,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}) {
  return (
    <section aria-label="Trash actions" aria-busy={isBusy}>
      <p>
        {loadedCount} media loaded · {selectedCount} selected
      </p>
      <button type="button" disabled={selectionLocked || !loadedCount} onClick={onSelectLoaded}>
        Select loaded
      </button>{' '}
      <button type="button" disabled={selectionLocked || !selectedCount} onClick={onClearSelection}>
        Clear selection
      </button>{' '}
      <button type="button" disabled={selectionLocked || !restoreAllowed} onClick={onRestore}>
        Restore selected
      </button>{' '}
      <button type="button" disabled={selectionLocked || !selectedCount} onClick={onRequestDelete}>
        Permanently delete selected
      </button>
      {selectedCount > 0 && !restoreAllowed && (
        <p>
          Some selected media cannot be restored because deletion has already started or their
          status is unavailable.
        </p>
      )}
      {isBusy && <Spinner label="Updating trash…" />}
      <ConfirmDialog
        open={confirmationCount > 0}
        title={`Permanently delete ${confirmationCount} selected media?`}
        description="This will delete the files permanently and cannot be undone."
        confirmLabel="Confirm permanent deletion"
        pendingLabel="Deleting…"
        isPending={isBusy}
        error={error}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </section>
  );
}
