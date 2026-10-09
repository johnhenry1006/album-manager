import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { MutationEditor } from './MutationEditor.jsx';

function editor(overrides = {}) {
  return {
    draft: { name: '' },
    editingId: null,
    deleting: null,
    isPending: false,
    submit: vi.fn((event) => event.preventDefault()),
    cancel: vi.fn(),
    confirmDelete: vi.fn(),
    ...overrides,
  };
}
function form(state) {
  return (
    <MutationEditor
      editor={state}
      noun="item"
      deleteDescription="Removes assignments."
      fields={
        <label>
          Name <input name="name" required defaultValue="" />
        </label>
      }
    />
  );
}

it('focuses the first field and delegates a valid submit or cancellation', async () => {
  const state = editor();
  const user = userEvent.setup();
  render(form(state));
  expect(screen.getByLabelText('Name')).toHaveFocus();
  await user.type(screen.getByLabelText('Name'), 'Travel');
  await user.click(screen.getByRole('button', { name: 'Save item' }));
  expect(state.submit).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.cancel).toHaveBeenCalledOnce();
});

it('uses native required-field validation to prevent an empty submission', async () => {
  const state = editor();
  render(form(state));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save item' }));
  expect(screen.getByLabelText('Name')).toBeInvalid();
  expect(state.submit).not.toHaveBeenCalled();
});

it('disables all editing controls while saving and exposes failure feedback', async () => {
  const state = editor({ editingId: 'item', isPending: true });
  const view = render(form(state));
  expect(screen.getByRole('form', { name: 'Edit item' })).toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.cancel).not.toHaveBeenCalled();
  view.rerender(form({ ...state, isPending: false, error: 'Conflict' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Conflict');
  expect(screen.getByRole('button', { name: 'Save item' })).toBeEnabled();
});

it('focuses the deletion confirmation and blocks its actions while deleting', async () => {
  const state = editor({ draft: null, deleting: { id: 'item', name: 'Travel' } });
  const view = render(form(state));
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(screen.getByRole('dialog')).toHaveTextContent('Delete Travel?');
  expect(screen.getByRole('dialog')).toHaveTextContent('Removes assignments.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Delete item' }));
  expect(state.confirmDelete).toHaveBeenCalledOnce();
  view.rerender(form({ ...state, isPending: true }));
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  view.rerender(form({ ...state, deleting: null, notice: 'Deleted.' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Deleted.');
});
