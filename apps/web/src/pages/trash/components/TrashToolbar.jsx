export function TrashToolbar({
  loadedCount,
  selectedCount,
  isBusy,
  selectionLocked,
  restoreAllowed,
  confirmationCount,
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
      {isBusy && <p role="status">Updating trash…</p>}
      {confirmationCount > 0 && (
        <section
          role="alertdialog"
          aria-labelledby="trash-delete-title"
          aria-describedby="trash-delete-description"
        >
          <h2 id="trash-delete-title">Permanently delete {confirmationCount} selected media?</h2>
          <p id="trash-delete-description">
            This will delete the files permanently and cannot be undone.
          </p>
          <button type="button" disabled={isBusy} onClick={onCancelDelete} autoFocus>
            Cancel
          </button>{' '}
          <button type="button" disabled={isBusy} onClick={onConfirmDelete}>
            Confirm permanent deletion
          </button>
        </section>
      )}
    </section>
  );
}
