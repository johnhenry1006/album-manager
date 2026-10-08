import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import {
  useFavoriteMedia,
  useInfiniteMedia,
  useMedia,
  useMediaActions,
  useMediaSelection,
  useMediaVariants,
} from '../index.js';

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

it('uses opaque cursors and starts fresh when collection filters change', async () => {
  const requests = [];
  vi.stubGlobal('fetch', async (url, options) => {
    const query = new URL(url, 'http://localhost').searchParams;
    requests.push({ query, signal: options.signal });
    const next = query.has('cursor');
    return respond({
      items: [{ id: next ? 'second' : 'first' }],
      hasMore: !next,
      nextCursor: next ? null : 'opaque+/=',
    });
  });
  const { wrapper } = setup();
  const { result, rerender } = renderHook(({ q }) => useInfiniteMedia({ q, favorite: false }), {
    wrapper,
    initialProps: { q: 'cats & dogs' },
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.nextCursor).toBe('opaque+/=');
  const initialItems = result.current.items;
  rerender({ q: 'cats & dogs' });
  expect(result.current.items).toBe(initialItems);
  await act(() => result.current.fetchNextPage());
  await waitFor(() =>
    expect(result.current.items.map(({ id }) => id)).toEqual(['first', 'second']),
  );
  expect(requests[1].query.get('cursor')).toBe('opaque+/=');
  expect(requests[0].query.get('favorite')).toBe('false');
  expect(requests[0].query.get('q')).toBe('cats & dogs');
  expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  expect(result.current.hasNextPage).toBe(false);
  expect(result.current.nextCursor).toBeNull();
  rerender({ q: 'birds' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.items).toEqual([{ id: 'first' }]);
  expect(requests.at(-1).query.has('cursor')).toBe(false);
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
  const { result } = renderHook(
    () => useInfiniteMedia({ limit: 10 }, { collection: 'trash' }),
    setup(),
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(requested.pathname).toBe('/api/trash');
  expect([...requested.searchParams]).toEqual([['limit', '10']]);
});

it('disables missing detail IDs and shares detail data with variant selection', async () => {
  const fetch = vi.fn(async () =>
    respond({
      id: 'media',
      variants: [
        { type: 'ORIGINAL', url: 'original' },
        { type: 'THUMBNAIL', width: 200, url: 'thumb' },
        { type: 'PREVIEW', width: 1600, url: 'preview' },
      ],
    }),
  );
  vi.stubGlobal('fetch', fetch);
  const { wrapper } = setup();
  const { result, rerender } = renderHook(
    ({ id }) => {
      const media = useMedia(id);
      return { ...media, display: useMediaVariants(media.data) };
    },
    { wrapper, initialProps: { id: undefined } },
  );
  expect(fetch).not.toHaveBeenCalled();
  rerender({ id: 'media' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.display.preview.url).toBe('preview');
  expect(result.current.display.thumbnail.url).toBe('thumb');
  expect(result.current.display.variants).toHaveLength(2);
});

it('keeps ID selection independent of pages, deduplicates and explicitly reconciles it', () => {
  const { result } = renderHook(() => useMediaSelection(['a', 'a']));
  expect(result.current.selectedIds).toEqual(['a']);
  act(() => result.current.selectAll(['a', 'b', 'c']));
  act(() => result.current.toggle('b'));
  expect(result.current.selectedIds).toEqual(['a', 'c']);
  expect(result.current.isSelected('c')).toBe(true);
  act(() => result.current.retainSelection(['c', 'd']));
  expect(result.current.selectedCount).toBe(1);
  act(() => result.current.clearSelection());
  expect(result.current.selectedIds).toEqual([]);
});

it.each([
  ['favorite', '/api/media/m/favorite', 'POST'],
  ['unfavorite', '/api/media/m/favorite', 'DELETE'],
  ['trash', '/api/media/m', 'DELETE'],
  ['restore', '/api/trash/m/restore', 'POST'],
  ['permanentDelete', '/api/trash/m/permanent', 'DELETE'],
])(
  '%s refreshes cached lists and details after the matching HTTP action',
  async (action, path, method) => {
    const requests = [];
    vi.stubGlobal('fetch', async (url, options) => {
      requests.push({ url, ...options });
      return respond(null, 204);
    });
    const { wrapper, client } = setup();
    client.setQueryData(['media', 'lists', 'media', {}], { items: [{ id: 'm' }] });
    client.setQueryData(['media', 'detail', 'm'], { id: 'm' });
    const { result } = renderHook(() => ({ ...useMediaActions(), ...useFavoriteMedia() }), {
      wrapper,
    });
    await act(() =>
      result.current[action].mutateAsync(
        action === 'permanentDelete' ? { mediaId: 'm', confirm: true } : 'm',
      ),
    );
    expect(requests[0].url).toBe(path);
    expect(requests[0].method).toBe(method);
    if (action === 'permanentDelete')
      expect(JSON.parse(requests[0].body)).toEqual({ confirm: true });
    expect(client.getQueryState(['media', 'lists', 'media', {}]).isInvalidated).toBe(true);
    if (['trash', 'permanentDelete'].includes(action))
      expect(client.getQueryData(['media', 'detail', 'm'])).toBeUndefined();
    else expect(client.getQueryState(['media', 'detail', 'm']).isInvalidated).toBe(true);
  },
);

it('does not issue a permanent delete without explicit confirmation', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => useMediaActions(), setup());
  await act(async () => {
    await expect(result.current.permanentDelete.mutateAsync({ mediaId: 'm' })).rejects.toThrow(
      'confirmation',
    );
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('surfaces centralized API errors without changing cached data', async () => {
  vi.stubGlobal('fetch', async () =>
    respond({ error: 'HTTP_ERROR', message: 'Missing media', requestId: 'r' }, 404),
  );
  const { result } = renderHook(() => useMedia('missing'), setup());
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error.status).toBe(404);
  expect(result.current.error.message).toBe('Missing media');
});

it('cancels the detail request when its last consumer unmounts', async () => {
  let signal;
  vi.stubGlobal('fetch', (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason)),
    );
  });
  const { unmount } = renderHook(() => useMedia('m'), setup());
  await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
  unmount();
  expect(signal.aborted).toBe(true);
});

it('keeps cached favorites intact when a mutation fails', async () => {
  vi.stubGlobal('fetch', async () =>
    respond({ error: 'HTTP_ERROR', message: 'Missing media' }, 404),
  );
  const { client, wrapper } = setup();
  client.setQueryData(['media', 'detail', 'm'], { id: 'm', favorite: true });
  const { result } = renderHook(() => useFavoriteMedia(), { wrapper });
  await act(async () => {
    await expect(result.current.unfavorite.mutateAsync('m')).rejects.toMatchObject({ status: 404 });
  });
  expect(client.getQueryData(['media', 'detail', 'm'])).toEqual({ id: 'm', favorite: true });
  expect(client.getQueryState(['media', 'detail', 'm']).isInvalidated).toBe(false);
});

it('refreshes trash after a failed purge that may have changed restore eligibility', async () => {
  vi.stubGlobal('fetch', async () =>
    respond({ error: 'INTERNAL_ERROR', message: 'Storage unavailable' }, 500),
  );
  const { client, wrapper } = setup();
  client.setQueryData(['media', 'lists', 'trash', { limit: 50 }], {
    pages: [{ items: [{ id: 'm', canRestore: true }], hasMore: false, nextCursor: null }],
    pageParams: [undefined],
  });
  const { result } = renderHook(() => useMediaActions(), { wrapper });
  await act(async () => {
    await expect(
      result.current.permanentDelete.mutateAsync({ mediaId: 'm', confirm: true }),
    ).rejects.toMatchObject({ status: 500 });
  });
  expect(client.getQueryState(['media', 'lists', 'trash', { limit: 50 }]).isInvalidated).toBe(true);
});

it('supports deselection and stable selection actions across rerenders', () => {
  const { result, rerender } = renderHook(() => useMediaSelection());
  const select = result.current.select;
  act(() => result.current.select('m'));
  rerender();
  expect(result.current.select).toBe(select);
  expect(result.current.selectedIds).toEqual(['m']);
  act(() => result.current.deselect('m'));
  expect(result.current.selectedCount).toBe(0);
});

it('uses lightweight gallery thumbnails when detail variants are unavailable', () => {
  const { result, rerender } = renderHook(({ media }) => useMediaVariants(media), {
    initialProps: { media: { thumbnails: [{ name: 'small', url: 'thumb', width: 200 }] } },
  });
  expect(result.current.thumbnail.url).toBe('thumb');
  expect(result.current.preview.url).toBe('thumb');
  rerender({ media: null });
  expect(result.current.thumbnail).toBeNull();
  expect(result.current.preview).toBeNull();
});

it.each(['trash', 'permanentDelete'])('%s clears detail from mounted consumers', async (action) => {
  let deleted = false;
  vi.stubGlobal('fetch', async (_url, options) => {
    if (options.method === 'DELETE') {
      deleted = true;
      return respond(null, 204);
    }
    return deleted
      ? respond({ error: 'HTTP_ERROR', message: 'Missing media' }, 404)
      : respond({ id: 'm', variants: [{ type: 'PREVIEW', url: 'signed' }] });
  });
  const { wrapper } = setup();
  const media = renderHook(() => useMedia('m'), { wrapper });
  const actions = renderHook(() => useMediaActions(), { wrapper });
  await waitFor(() => expect(media.result.current.isSuccess).toBe(true));
  await act(() =>
    actions.result.current[action].mutateAsync(
      action === 'trash' ? 'm' : { mediaId: 'm', confirm: true },
    ),
  );
  await waitFor(() => expect(media.result.current.data?.id).toBeUndefined());
});
