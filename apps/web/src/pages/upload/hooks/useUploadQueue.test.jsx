import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useUploadQueue } from './useUploadQueue.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const photo = (name) => new File(['image'], name, { type: 'image/jpeg' });

function setup({ concurrency = 2, onReady = vi.fn(), upload } = {}) {
  const uploads = {
    files: {},
    has: vi.fn(() => false),
    upload: upload ?? vi.fn().mockResolvedValue('final-media'),
    retry: vi.fn().mockResolvedValue('retried-media'),
    cancel: vi.fn(),
    remove: vi.fn(),
    getSnapshot: vi.fn(() => ({})),
    resolveDuplicate: vi.fn(),
  };
  const options = { albumId: 'album', categoryIds: ['category'], tagIds: ['tag'] };
  const hook = renderHook(
    ({ options }) => useUploadQueue({ uploads, options, onReady, concurrency }),
    {
      initialProps: { options },
    },
  );
  return { ...hook, uploads, options, onReady };
}

it('rejects invalid files locally without invoking the upload lifecycle', async () => {
  const { result, uploads, onReady } = setup();
  act(() => result.current.addFiles([new File(['text'], 'file.txt', { type: 'text/plain' })]));
  expect(result.current.items[0].status).toBe('invalid');
  expect(result.current.items[0].error).toBeTruthy();
  act(() => result.current.start());
  expect(uploads.upload).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
  expect(result.current.isBusy).toBe(false);
});

it('holds a concurrency slot through assignment and starts the next file when it finishes', async () => {
  const assignment = deferred();
  const onReady = vi.fn().mockImplementationOnce(() => assignment.promise);
  const { result, uploads } = setup({ concurrency: 1, onReady });
  act(() => result.current.addFiles([photo('first.jpg'), photo('second.jpg')]));
  expect(result.current.queuedCount).toBe(2);
  act(() => result.current.start());
  await waitFor(() => expect(result.current.items[0].status).toBe('assigning'));
  expect(uploads.upload).toHaveBeenCalledTimes(1);
  expect(result.current.items[1].status).toBe('pending');
  act(() => result.current.start());
  expect(uploads.upload).toHaveBeenCalledTimes(1);
  await act(async () => assignment.resolve());
  await waitFor(() =>
    expect(result.current.items.map(({ status }) => status)).toEqual(['completed', 'completed']),
  );
  expect(uploads.upload).toHaveBeenCalledTimes(2);
  expect(result.current.isBusy).toBe(false);
});

it('captures options at start and retries assignment without transferring the file again', async () => {
  const onReady = vi
    .fn()
    .mockRejectedValueOnce(new Error('Assignment failed'))
    .mockResolvedValue(undefined);
  const { result, uploads, options, rerender } = setup({ onReady });
  act(() => result.current.addFiles([photo('photo.jpg')]));
  act(() => result.current.start());
  await waitFor(() => expect(result.current.items[0].status).toBe('failed'));
  const id = result.current.items[0].id;
  options.categoryIds.push('later-category');
  rerender({ options: { albumId: 'other', categoryIds: [], tagIds: [] } });
  act(() => result.current.retry(id));
  await waitFor(() => expect(result.current.items[0].status).toBe('completed'));
  expect(uploads.upload).toHaveBeenCalledOnce();
  expect(uploads.retry).not.toHaveBeenCalled();
  expect(onReady).toHaveBeenCalledTimes(2);
  for (const [item, mediaId] of onReady.mock.calls) {
    expect(mediaId).toBe('final-media');
    expect(item.options).toEqual({ albumId: 'album', categoryIds: ['category'], tagIds: ['tag'] });
  }
});

it('uses the existing lifecycle retry for a retryable transfer failure', async () => {
  const { result, uploads } = setup();
  uploads.upload.mockRejectedValueOnce(new Error('Network unavailable'));
  uploads.getSnapshot.mockImplementation(() => ({
    [result.current.items[0].id]: { canRetry: true },
  }));
  act(() => result.current.addFiles([photo('retry.jpg')]));
  act(() => result.current.start());
  await waitFor(() => expect(result.current.items[0].canRetry).toBe(true));
  uploads.has.mockReturnValue(true);
  const id = result.current.items[0].id;
  act(() => result.current.retry(id));
  await waitFor(() => expect(result.current.items[0].status).toBe('completed'));
  expect(uploads.retry).toHaveBeenCalledExactlyOnceWith(id);
  expect(uploads.upload).toHaveBeenCalledOnce();
  expect(result.current.items[0].finalMediaId).toBe('retried-media');
});

it('treats a duplicate skip as finished without assigning any media', async () => {
  const { result, uploads, onReady } = setup();
  uploads.upload.mockResolvedValue(null);
  act(() => result.current.addFiles([photo('duplicate.jpg')]));
  act(() => result.current.start());
  await waitFor(() => expect(result.current.items[0].status).toBe('skipped'));
  expect(onReady).not.toHaveBeenCalled();
  expect(result.current.items[0].canRetry).toBe(false);
  const id = result.current.items[0].id;
  act(() => result.current.clearFinished());
  expect(result.current.items).toEqual([]);
  expect(uploads.remove).toHaveBeenCalledWith(id);
});

it('cancels active and waiting tasks and suppresses assignment after late upload completion', async () => {
  const transfer = deferred();
  const { result, uploads, onReady } = setup({
    concurrency: 1,
    upload: vi.fn(() => transfer.promise),
  });
  act(() => result.current.addFiles([photo('first.jpg'), photo('second.jpg')]));
  act(() => result.current.start());
  const ids = result.current.items.map(({ id }) => id);
  act(() => result.current.remove(ids[0]));
  expect(uploads.remove).not.toHaveBeenCalled();
  act(() => result.current.cancelAll());
  await act(async () => transfer.resolve('late-media'));
  await waitFor(() =>
    expect(result.current.items.map(({ status }) => status)).toEqual(['cancelled', 'cancelled']),
  );
  expect(uploads.cancel.mock.calls.map(([id]) => id)).toEqual(ids);
  expect(uploads.upload).toHaveBeenCalledOnce();
  expect(onReady).not.toHaveBeenCalled();
  expect(result.current.items.every(({ error }) => error === null)).toBe(true);
});

it('aborts assignment on unmount and never starts waiting tasks', async () => {
  const assignment = deferred();
  const onReady = vi.fn(() => assignment.promise);
  const { result, uploads, unmount } = setup({ concurrency: 1, onReady });
  act(() => result.current.addFiles([photo('first.jpg'), photo('second.jpg')]));
  act(() => result.current.start());
  await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  const signal = onReady.mock.calls[0][2];
  expect(signal.aborted).toBe(false);
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => assignment.resolve());
  expect(uploads.upload).toHaveBeenCalledOnce();
});
