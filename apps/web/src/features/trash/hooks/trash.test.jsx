import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { useMedia } from '@/features/media/index.js';
import { createQueryClient } from '@/services/queryClient.js';

import { useInfiniteTrash, usePermanentDeleteMedia, useRestoreMedia } from '../index.js';

const clients = [];
function setup() {
  const client = createQueryClient();
  clients.push(client);
  return {
    client,
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  };
}
function respond(payload, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

it('lists trash through its endpoint without media-only parameters', async () => {
  let requested;
  vi.stubGlobal('fetch', async (url) => {
    requested = new URL(url, 'http://localhost');
    return respond({
      items: [{ id: 'trashed', canRestore: true }],
      nextCursor: null,
      hasMore: false,
    });
  });
  const { result } = renderHook(() => useInfiniteTrash({ limit: 10 }), setup());
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(requested.pathname).toBe('/api/trash');
  expect([...requested.searchParams]).toEqual([['limit', '10']]);
});

it('does not issue a permanent delete without explicit confirmation', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => usePermanentDeleteMedia(), setup());
  await act(async () => {
    await expect(result.current.mutateAsync({ mediaId: 'm' })).rejects.toThrow('confirmation');
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('refreshes trash after a failed purge that may have changed restore eligibility', async () => {
  vi.stubGlobal('fetch', async () =>
    respond({ error: 'INTERNAL_ERROR', message: 'Storage unavailable' }, 500),
  );
  const { client, wrapper } = setup();
  client.setQueryData(['trash', 'lists', { limit: 50 }], {
    pages: [{ items: [{ id: 'm', canRestore: true }], hasMore: false, nextCursor: null }],
    pageParams: [undefined],
  });
  const { result } = renderHook(() => usePermanentDeleteMedia(), { wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync({ mediaId: 'm', confirm: true })).rejects.toMatchObject(
      { status: 500 },
    );
  });
  expect(client.getQueryState(['trash', 'lists', { limit: 50 }]).isInvalidated).toBe(true);
});

it('follows opaque cursors, deduplicates overlapping media', async () => {
  const requests = [];
  vi.stubGlobal('fetch', async (url, options) => {
    const parsed = new URL(url, 'http://localhost');
    requests.push({ parsed, signal: options.signal });
    return respond(
      parsed.searchParams.has('cursor')
        ? { items: [{ id: 'first' }, { id: 'second' }], hasMore: false, nextCursor: null }
        : { items: [{ id: 'first' }], hasMore: true, nextCursor: 'opaque+/=' },
    );
  });
  const { result } = renderHook(() => useInfiniteTrash(), setup());
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(() => result.current.fetchNextPage());
  await waitFor(() =>
    expect(result.current.items.map(({ id }) => id)).toEqual(['first', 'second']),
  );
  expect(requests[1].parsed.searchParams.get('cursor')).toBe('opaque+/=');
  expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  expect(result.current.hasNextPage).toBe(false);
});

it.each([
  ['restore', '/api/trash/m/restore', 'POST'],
  ['permanentDelete', '/api/trash/m/permanent', 'DELETE'],
])('%s refreshes trash, media and album caches', async (action, path, method) => {
  const requests = [];
  vi.stubGlobal('fetch', async (url, options) => {
    requests.push({ url, ...options });
    return respond(null, 204);
  });
  const { client, wrapper } = setup();
  const keys = [
    ['trash', 'lists', { limit: 50 }],
    ['media', 'lists', 'media', {}],
    ['album', 'detail', 'a'],
  ];
  keys.forEach((key) => client.setQueryData(key, { items: [{ id: 'm' }] }));
  client.setQueryData(['media', 'detail', 'm'], { id: 'm' });
  const { result } = renderHook(
    () => ({ restore: useRestoreMedia(), permanentDelete: usePermanentDeleteMedia() }),
    { wrapper },
  );
  await act(() =>
    result.current[action].mutateAsync(
      action === 'restore' ? 'm' : { mediaId: 'm', confirm: true },
    ),
  );
  expect(requests[0].url).toBe(path);
  expect(requests[0].method).toBe(method);
  if (action === 'permanentDelete') expect(JSON.parse(requests[0].body)).toEqual({ confirm: true });
  keys.forEach((key) => expect(client.getQueryState(key).isInvalidated).toBe(true));
  if (action === 'permanentDelete')
    expect(client.getQueryData(['media', 'detail', 'm'])).toBeUndefined();
  else expect(client.getQueryState(['media', 'detail', 'm']).isInvalidated).toBe(true);
});

it('permanent deletion clears detail from mounted consumers', async () => {
  let deleted = false;
  vi.stubGlobal('fetch', async (_url, options) => {
    if (options.method === 'DELETE') {
      deleted = true;
      return respond(null, 204);
    }
    return deleted
      ? respond({ error: 'NOT_FOUND', message: 'Missing media' }, 404)
      : respond({ id: 'm' });
  });
  const { wrapper } = setup();
  const media = renderHook(() => useMedia('m'), { wrapper });
  const actions = renderHook(() => usePermanentDeleteMedia(), { wrapper });
  await waitFor(() => expect(media.result.current.isSuccess).toBe(true));
  await act(() => actions.result.current.mutateAsync({ mediaId: 'm', confirm: true }));
  await waitFor(() => expect(media.result.current.data?.id).toBeUndefined());
});

it('cancels the trash request when its last consumer unmounts', async () => {
  let signal;
  vi.stubGlobal('fetch', (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason)),
    );
  });
  const { unmount } = renderHook(() => useInfiniteTrash(), setup());
  await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
  unmount();
  expect(signal.aborted).toBe(true);
});

it('retains cached trash when restoration fails', async () => {
  vi.stubGlobal('fetch', async () =>
    respond({ error: 'TRASH_CONFLICT', message: 'Purge started' }, 409),
  );
  const { client, wrapper } = setup();
  const key = ['trash', 'lists', { limit: 50 }];
  const data = {
    pages: [{ items: [{ id: 'm', canRestore: false }], hasMore: false, nextCursor: null }],
    pageParams: [undefined],
  };
  client.setQueryData(key, data);
  const { result } = renderHook(() => useRestoreMedia(), { wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync('m')).rejects.toMatchObject({ status: 409 });
  });
  expect(client.getQueryData(key)).toEqual(data);
  expect(client.getQueryState(key).isInvalidated).toBe(false);
});
