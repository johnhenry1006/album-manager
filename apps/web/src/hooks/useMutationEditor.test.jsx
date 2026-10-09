import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useMutationEditor } from './useMutationEditor.js';

function setup(overrides = {}) {
  const save = vi.fn().mockResolvedValue('Saved.');
  const remove = vi.fn().mockResolvedValue('Deleted.');
  const hook = renderHook(() =>
    useMutationEditor({
      emptyDraft: { name: '', slug: '' },
      save,
      remove,
      ...overrides,
    }),
  );
  return { ...hook, save, remove };
}

function event(valid = true) {
  return {
    preventDefault: vi.fn(),
    currentTarget: {
      elements: [{ name: 'name', required: true }],
      reportValidity: vi.fn(() => valid),
    },
  };
}

it('copies only declared draft fields and trims submitted strings', async () => {
  const { result, save } = setup();
  const item = { id: 'item', name: ' Travel ', slug: ' travel ', privateField: 'hidden' };
  act(() => result.current.openEditor(item));
  expect(result.current.draft).toEqual({ name: ' Travel ', slug: ' travel ' });
  const submit = event();
  await act(() => result.current.submit(submit));
  expect(submit.preventDefault).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Travel', slug: 'travel' }, 'item');
  expect(item.name).toBe(' Travel ');
  expect(result.current.draft).toBeNull();
  expect(result.current.notice).toBe('Saved.');
});

it('rejects whitespace-only required input before saving', async () => {
  const { result, save } = setup();
  act(() => result.current.openEditor());
  act(() => result.current.setField('name', '   '));
  await act(() => result.current.submit(event()));
  expect(result.current.error).toBe('Enter a name.');
  expect(save).not.toHaveBeenCalled();
  act(() => result.current.setField('name', 'Valid'));
  expect(result.current.error).toBe('');
});

it('honors browser form validity before calling a mutation', async () => {
  const { result, save } = setup();
  act(() => result.current.openEditor({ id: 'item', name: 'Valid' }));
  await act(() => result.current.submit(event(false)));
  expect(save).not.toHaveBeenCalled();
  expect(result.current.draft.name).toBe('Valid');
});

it('blocks repeated submissions and editor changes until a pending save finishes', async () => {
  let finish;
  const save = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = setup({ save });
  act(() => result.current.openEditor({ id: 'item', name: 'Travel' }));
  let pending;
  act(() => {
    pending = result.current.submit(event());
  });
  expect(result.current.isPending).toBe(true);
  act(() => {
    result.current.submit(event());
    result.current.cancel();
    result.current.openEditor({ id: 'other', name: 'Other' });
    result.current.requestDelete({ id: 'item', name: 'Travel' });
  });
  expect(save).toHaveBeenCalledOnce();
  expect(result.current.editingId).toBe('item');
  expect(result.current.draft.name).toBe('Travel');
  expect(result.current.deleting).toBeNull();
  await act(async () => {
    finish('Saved.');
    await pending;
  });
  expect(result.current.isPending).toBe(false);
  expect(result.current.draft).toBeNull();
});

it('preserves a failed draft for retry and clears errors on cancellation', async () => {
  const { result, save } = setup();
  save.mockRejectedValueOnce(new Error('Conflict'));
  act(() => result.current.openEditor({ id: 'item', name: 'Travel' }));
  await act(() => result.current.submit(event()));
  expect(result.current.error).toBe('Conflict');
  expect(result.current.draft.name).toBe('Travel');
  expect(result.current.isPending).toBe(false);
  await act(() => result.current.submit(event()));
  expect(result.current.notice).toBe('Saved.');
  act(() => result.current.openEditor());
  expect(result.current.notice).toBe('');
  act(() => result.current.cancel());
  expect(result.current.draft).toBeNull();
  expect(result.current.error).toBe('');
});

it('requires a deletion target and retains confirmation after failure', async () => {
  const { result, remove } = setup();
  await act(() => result.current.confirmDelete());
  expect(remove).not.toHaveBeenCalled();
  act(() => result.current.requestDelete({ id: 'item', name: 'Travel' }));
  remove.mockRejectedValueOnce(new Error('In use'));
  await act(() => result.current.confirmDelete());
  expect(result.current.deleting.id).toBe('item');
  expect(result.current.error).toBe('In use');
  await act(() => result.current.confirmDelete());
  expect(remove).toHaveBeenCalledWith('item');
  expect(result.current.deleting).toBeNull();
  expect(result.current.notice).toBe('Deleted.');
});
