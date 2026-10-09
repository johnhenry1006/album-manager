import { useEffect, useId, useRef } from 'react';

import styles from './ConfirmDialog.module.css';
import { ErrorState } from './ErrorState.jsx';

export function ConfirmDialog({
  open,
  title,
  description,
  label,
  role = 'alertdialog',
  confirmLabel = 'Confirm',
  pendingLabel = 'Working…',
  isPending = false,
  error,
  onConfirm,
  onCancel,
}) {
  const id = useId();
  const dialog = useRef(null);
  const cancel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const element = dialog.current;
    if (element.showModal) element.showModal();
    else element.setAttribute('open', '');
    cancel.current?.focus();
    return () => {
      element.close?.();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      role={role}
      aria-modal="true"
      aria-label={label}
      aria-labelledby={label ? undefined : `${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={isPending}
      onCancel={(event) => {
        event.preventDefault();
        if (!isPending) onCancel();
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{description}</p>
      {error && (
        <ErrorState title="Could not complete action" description={error.message || error} />
      )}
      <div className={styles.actions}>
        <button ref={cancel} type="button" disabled={isPending} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" disabled={isPending} onClick={onConfirm}>
          {isPending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
