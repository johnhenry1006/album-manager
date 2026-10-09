import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog.jsx';

function Confirmation({ isPending = false }) {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Delete record</button>
      {deleted && <p>Record deleted</p>}
      <ConfirmDialog
        open={open}
        title="Delete record?"
        description="Cannot be undone."
        isPending={isPending}
        confirmLabel="Delete"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setDeleted(true);
          setOpen(false);
        }}
      />
    </>
  );
}

it('focuses Cancel and restores focus to the opener after cancellation', async () => {
  const user = userEvent.setup();
  render(<Confirmation />);
  await user.click(screen.getByRole('button', { name: 'Delete record' }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete record' })).toHaveFocus();
  expect(screen.queryByText('Record deleted')).not.toBeInTheDocument();
});

it('allows Escape cancellation while idle and blocks it during a pending operation', async () => {
  const user = userEvent.setup();
  const view = render(<Confirmation />);
  await user.click(screen.getByRole('button', { name: 'Delete record' }));
  // The native browser translates Escape to the dialog cancel event.
  fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete record' }));
  view.rerender(<Confirmation isPending />);
  fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
});
