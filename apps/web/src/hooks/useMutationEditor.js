import { useRef, useState } from 'react';

// Domain-independent editor lifecycle; callers supply drafts and mutation actions.
export function useMutationEditor({ emptyDraft, save, remove }) {
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isPending, setIsPending] = useState(false);
  const busy = useRef(false);

  function openEditor(item = null) {
    if (busy.current) return;
    setDraft(
      item
        ? Object.fromEntries(
            Object.keys(emptyDraft).map((key) => [key, item[key] ?? emptyDraft[key]]),
          )
        : { ...emptyDraft },
    );
    setEditingId(item?.id ?? null);
    setDeleting(null);
    setError('');
    setNotice('');
  }
  function cancel() {
    if (busy.current) return;
    setDraft(null);
    setDeleting(null);
    setError('');
  }
  function setField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError('');
  }
  async function run(action, onSuccess) {
    if (busy.current) return;
    busy.current = true;
    setIsPending(true);
    setError('');
    setNotice('');
    try {
      const message = await action();
      onSuccess();
      setNotice(message);
    } catch (failure) {
      setError(failure.message || 'Could not save changes. Please try again.');
    } finally {
      busy.current = false;
      setIsPending(false);
    }
  }
  function submit(event) {
    event.preventDefault();
    if (busy.current || !draft) return;
    // HTML constraints own field validation; trim strings before checking required inputs.
    const values = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ]),
    );
    for (const input of event.currentTarget.elements) {
      if (input.required && typeof values[input.name] === 'string' && !values[input.name]) {
        setError(`Enter a ${input.name}.`);
        return;
      }
    }
    if (!event.currentTarget.reportValidity()) return;
    return run(
      () => save(values, editingId),
      () => setDraft(null),
    );
  }
  function requestDelete(item) {
    if (busy.current) return;
    setDraft(null);
    setDeleting(item);
    setError('');
    setNotice('');
  }
  function confirmDelete() {
    if (!deleting) return;
    return run(
      () => remove(deleting.id),
      () => setDeleting(null),
    );
  }
  return {
    draft,
    editingId,
    deleting,
    error,
    notice,
    isPending,
    openEditor,
    cancel,
    setField,
    submit,
    requestDelete,
    confirmDelete,
  };
}
