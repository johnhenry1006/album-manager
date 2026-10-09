import { useEffect, useRef } from 'react';

import { ConfirmDialog } from './ConfirmDialog.jsx';
import { ErrorState } from './ErrorState.jsx';

export function MutationEditor({ editor, noun, fields, deleteDescription }) {
  const form = useRef(null);
  const isEditing = Boolean(editor.draft);
  useEffect(() => {
    form.current?.querySelector('input')?.focus();
  }, [editor.editingId, isEditing]);
  return (
    <>
      {editor.draft && (
        <form
          ref={form}
          aria-label={`${editor.editingId ? 'Edit' : 'Create'} ${noun}`}
          onSubmit={editor.submit}
        >
          <h2>
            {editor.editingId ? 'Edit' : 'Create'} {noun}
          </h2>
          <fieldset disabled={editor.isPending}>
            {fields}
            <button type="submit">{editor.isPending ? 'Saving…' : `Save ${noun}`}</button>{' '}
            <button type="button" onClick={editor.cancel}>
              Cancel
            </button>
          </fieldset>
        </form>
      )}
      <ConfirmDialog
        open={Boolean(editor.deleting)}
        role="dialog"
        label={`Delete ${noun}`}
        title={`Delete ${editor.deleting?.name}?`}
        description={deleteDescription}
        confirmLabel={`Delete ${noun}`}
        pendingLabel="Deleting…"
        isPending={editor.isPending}
        onConfirm={editor.confirmDelete}
        onCancel={editor.cancel}
        error={editor.error}
      />
      {editor.error && !editor.deleting && (
        <ErrorState title="Could not save changes" description={editor.error} />
      )}
      {editor.notice && <p role="status">{editor.notice}</p>}
    </>
  );
}
