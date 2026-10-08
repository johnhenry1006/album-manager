import { useEffect, useRef } from 'react';

export function MutationEditor({ editor, noun, fields, deleteDescription }) {
  const form = useRef(null);
  const dialog = useRef(null);
  const isEditing = Boolean(editor.draft);
  useEffect(() => {
    form.current?.querySelector('input')?.focus();
  }, [editor.editingId, isEditing]);
  useEffect(() => {
    dialog.current?.focus();
  }, [editor.deleting]);
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
      {editor.deleting && (
        <section ref={dialog} role="dialog" aria-label={`Delete ${noun}`} tabIndex={-1}>
          <h2>Delete {editor.deleting.name}?</h2>
          <p>{deleteDescription}</p>
          <button type="button" disabled={editor.isPending} onClick={editor.confirmDelete}>
            {editor.isPending ? 'Deleting…' : `Delete ${noun}`}
          </button>{' '}
          <button type="button" disabled={editor.isPending} onClick={editor.cancel}>
            Cancel
          </button>
        </section>
      )}
      {editor.error && <p role="alert">{editor.error}</p>}
      {editor.notice && <p role="status">{editor.notice}</p>}
    </>
  );
}
