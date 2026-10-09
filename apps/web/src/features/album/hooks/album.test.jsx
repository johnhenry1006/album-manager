import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import * as album from '../index.js';

const clients = [];
function setup() {
  const client = createQueryClient();
  clients.push(client);
  return {
    client,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
function respond(body, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

it('paginates album search and shares equivalent default keys', async () => {
  const urls = [];
  vi.stubGlobal('fetch', async (url, options) => {
    urls.push(new URL(url, 'http://localhost'));
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return respond({
      items: [{ id: 'a', name: 'Trip' }],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    });
  });
  const { wrapper } = setup();
  const hook = renderHook(({ filters }) => album.useAlbums(filters), {
    wrapper,
    initialProps: { filters: { page: 2, limit: 10, q: 'cats & dogs' } },
  });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(urls[0].pathname).toBe('/api/albums');
  expect(Object.fromEntries(urls[0].searchParams)).toEqual({
    page: '2',
    limit: '10',
    q: 'cats & dogs',
  });
  hook.rerender({ filters: {} });
  await waitFor(() => expect(urls).toHaveLength(2));
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  hook.rerender({ filters: { page: 1, limit: 50 } });
  expect(urls).toHaveLength(2);
});

it('owns opaque media cursors, deduplicates overlaps, and resets for another album', async () => {
  const urls = [];
  vi.stubGlobal('fetch', async (url, options) => {
    const parsed = new URL(url, 'http://localhost');
    urls.push(parsed);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const next = parsed.searchParams.has('cursor');
    return respond({
      items: next
        ? [
            { id: 'one', membershipId: 'x' },
            { id: 'two', membershipId: 'y' },
          ]
        : [{ id: 'one', membershipId: 'x' }],
      hasMore: !next,
      nextCursor: next ? null : 'opaque+/=',
    });
  });
  const { wrapper } = setup();
  const hook = renderHook(({ id }) => album.useInfiniteAlbumMedia(id, { limit: 2 }), {
    wrapper,
    initialProps: { id: 'a' },
  });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  await act(() => hook.result.current.fetchNextPage());
  await waitFor(() =>
    expect(hook.result.current.items.map((item) => item.id)).toEqual(['one', 'two']),
  );
  expect(urls[1].searchParams.get('cursor')).toBe('opaque+/=');
  expect(hook.result.current.hasNextPage).toBe(false);
  hook.rerender({ id: 'b' });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(hook.result.current.items).toHaveLength(1);
  expect(urls.at(-1).pathname).toBe('/api/albums/b/media');
  expect(urls.at(-1).searchParams.has('cursor')).toBe(false);
});

it.each([{ cursor: 'caller' }, { status: 'unsupported' }])(
  'rejects unsupported gallery filters %j',
  (filters) => {
    expect(() => renderHook(() => album.useInfiniteAlbumMedia('a', filters), setup())).toThrow(
      TypeError,
    );
  },
);

it.each(['useAlbum', 'useInfiniteAlbumMedia'])(
  '%s disables missing IDs and cancels abandoned requests',
  async (hookName) => {
    let signal;
    vi.stubGlobal('fetch', (_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason)),
      );
    });
    const { wrapper } = setup();
    const hook = renderHook(({ id }) => album[hookName](id), {
      wrapper,
      initialProps: { id: undefined },
    });
    expect(signal).toBeUndefined();
    hook.rerender({ id: 'a/b' });
    await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
    hook.unmount();
    expect(signal.aborted).toBe(true);
  },
);

it.each([
  ['useCreateAlbum', { name: 'Trip' }, '/api/albums', 'POST', { name: 'Trip' }],
  [
    'useUpdateAlbum',
    { id: 'a', name: 'New', coverMediaId: 'm' },
    '/api/albums/a',
    'PATCH',
    { name: 'New', coverMediaId: 'm' },
  ],
  ['useDeleteAlbum', 'a', '/api/albums/a', 'DELETE', undefined],
])(
  '%s sends metadata and refreshes affected caches',
  async (hookName, variables, path, method, body) => {
    let request;
    vi.stubGlobal('fetch', async (url, options) => {
      request = { url, ...options };
      return respond({ id: 'a', name: 'New' }, method === 'DELETE' ? 204 : 200);
    });
    const { client, wrapper } = setup();
    client.setQueryData(['album', 'lists', {}], { items: [] });
    client.setQueryData(['album', 'detail', 'a'], { id: 'a' });
    client.setQueryData(['album', 'media', 'a', {}], { pages: [] });
    client.setQueryData(['media', 'detail', 'm'], { id: 'm' });
    const hook = renderHook(() => album[hookName](), { wrapper });
    await act(() => hook.result.current.mutateAsync(variables));
    expect(request.url).toBe(path);
    expect(request.method).toBe(method);
    expect(request.body === undefined ? undefined : JSON.parse(request.body)).toEqual(body);
    expect(client.getQueryState(['album', 'lists', {}]).isInvalidated).toBe(true);
    if (method === 'DELETE') {
      expect(client.getQueryData(['album', 'detail', 'a'])).toBeUndefined();
      expect(client.getQueryData(['album', 'media', 'a', {}])).toBeUndefined();
    }
    if (method !== 'POST')
      expect(client.getQueryState(['media', 'detail', 'm']).isInvalidated).toBe(true);
  },
);

it.each([
  [
    'add',
    { mediaId: 'm', position: 5 },
    '/api/albums/a/media',
    'POST',
    { mediaId: 'm', position: 5 },
  ],
  ['remove', 'm', '/api/albums/a/media/m', 'DELETE', undefined],
])(
  '%s membership refreshes cover/counts, gallery, and media memberships',
  async (action, variables, path, method, body) => {
    let request;
    vi.stubGlobal('fetch', async (url, options) => {
      request = { url, ...options };
      return respond({ membershipId: 'x' }, method === 'DELETE' ? 204 : 200);
    });
    const { client, wrapper } = setup();
    const keys = [
      ['album', 'lists', { page: 1 }],
      ['album', 'detail', 'a'],
      ['album', 'media', 'a', { limit: 50 }],
      ['media', 'lists', 'media', { album: 'a' }],
      ['media', 'detail', 'm'],
    ];
    keys.forEach((key) => client.setQueryData(key, {}));
    client.setQueryData(['album', 'detail', 'b'], { id: 'b' });
    const hook = renderHook(() => album.useAlbumMediaActions('a'), { wrapper });
    await act(() => hook.result.current[action].mutateAsync(variables));
    expect(request.url).toBe(path);
    expect(request.method).toBe(method);
    expect(request.body === undefined ? undefined : JSON.parse(request.body)).toEqual(body);
    keys.forEach((key) => expect(client.getQueryState(key).isInvalidated).toBe(true));
    expect(client.getQueryState(['album', 'detail', 'b']).isInvalidated).toBe(false);
  },
);

it('surfaces failed mutations without invalidating caches', async () => {
  vi.stubGlobal('fetch', async () => respond({ error: 'CONFLICT', message: 'Slug conflict' }, 409));
  const { client, wrapper } = setup();
  client.setQueryData(['album', 'detail', 'a'], { id: 'a', name: 'Before' });
  const hook = renderHook(() => album.useUpdateAlbum(), { wrapper });
  await act(async () => {
    await expect(hook.result.current.mutateAsync({ id: 'a', name: 'After' })).rejects.toMatchObject(
      { status: 409 },
    );
  });
  expect(client.getQueryData(['album', 'detail', 'a']).name).toBe('Before');
  expect(client.getQueryState(['album', 'detail', 'a']).isInvalidated).toBe(false);
});

it('paginates picker options and preserves a controlled selection outside the current page', async () => {
  vi.stubGlobal('fetch', async (url) => {
    const path = new URL(url, 'http://localhost');
    if (path.pathname === '/api/albums/selected')
      return respond({ id: 'selected', name: 'Selected album' });
    const page = Number(path.searchParams.get('page'));
    return respond({
      items: [{ id: `a${page}`, name: `Album ${page}` }],
      pagination: { page, limit: 50, total: 51, totalPages: 2 },
    });
  });
  const selected = [];
  render(<album.AlbumPicker value="selected" onChange={(id) => selected.push(id)} />, setup());
  await screen.findByRole('option', { name: 'Album 1' });
  await screen.findByRole('option', { name: 'Selected album' });
  expect(screen.getByRole('combobox', { name: 'Album' })).toHaveValue('selected');
  fireEvent.click(screen.getByRole('button', { name: 'Next albums' }));
  await screen.findByRole('option', { name: 'Album 2' });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a2' } });
  expect(selected).toEqual(['a2']);
});

it('renders only cover thumbnails and falls back when the album has no cover', async () => {
  const urls = [];
  vi.stubGlobal('fetch', async (url) => {
    urls.push(url);
    return respond({
      id: 'm',
      variants: [
        { type: 'ORIGINAL', url: '/original' },
        { type: 'PREVIEW', url: '/preview' },
        { type: 'THUMBNAIL', url: '/thumb', width: 200, height: 100 },
      ],
    });
  });
  const view = render(<album.AlbumCover album={{ name: 'Trip', coverMediaId: 'm' }} />, setup());
  await waitFor(() =>
    expect(screen.getByRole('img', { name: 'Trip cover' })).toHaveAttribute('src', '/thumb'),
  );
  expect(urls).toEqual(['/api/media/m']);
  view.rerender(<album.AlbumCover album={{ name: 'Empty', coverMediaId: null }} />);
  expect(screen.getByRole('img', { name: /Empty cover/ })).not.toHaveAttribute('src');
  expect(urls).toHaveLength(1);
});

it('clears deleted detail and gallery data from mounted consumers', async () => {
  let deleted = false;
  vi.stubGlobal('fetch', async (url, options) => {
    if (options.method === 'DELETE') {
      deleted = true;
      return respond(null, 204);
    }
    if (deleted) return respond({ error: 'NOT_FOUND', message: 'Album not found' }, 404);
    return url.includes('/media')
      ? respond({ items: [{ id: 'm' }], hasMore: false, nextCursor: null })
      : respond({ id: 'a', name: 'Trip' });
  });
  const { wrapper } = setup();
  const detail = renderHook(() => album.useAlbum('a'), { wrapper });
  const gallery = renderHook(() => album.useInfiniteAlbumMedia('a'), { wrapper });
  const mutation = renderHook(() => album.useDeleteAlbum(), { wrapper });
  await waitFor(() => expect(detail.result.current.data?.name).toBe('Trip'));
  await waitFor(() => expect(gallery.result.current.items).toHaveLength(1));
  await act(() => mutation.result.current.mutateAsync('a'));
  await waitFor(() => expect(detail.result.current.isError).toBe(true));
  expect(detail.result.current.data).toBeNull();
  expect(gallery.result.current.items).toEqual([]);
});

it('uses supplied matching cover data without a detail request', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(
    <album.AlbumCover
      album={{ name: 'Trip', coverMediaId: 'm' }}
      coverMedia={{ id: 'm', thumbnails: [{ url: '/thumb', width: 200, height: 100 }] }}
    />,
    setup(),
  );
  expect(screen.getByRole('img', { name: 'Trip cover' })).toHaveAttribute('src', '/thumb');
  expect(fetch).not.toHaveBeenCalled();
});

it('does not execute membership actions without an album ID', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const hook = renderHook(() => album.useAlbumMediaActions(), setup());
  await act(async () => {
    await expect(hook.result.current.add.mutateAsync({ mediaId: 'm' })).rejects.toThrow(TypeError);
    await expect(hook.result.current.remove.mutateAsync('m')).rejects.toThrow(TypeError);
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('resets picker search to the first page and exposes list failures', async () => {
  const requests = [];
  vi.stubGlobal('fetch', async (url) => {
    const params = new URL(url, 'http://localhost').searchParams;
    requests.push(Object.fromEntries(params));
    return params.has('q')
      ? respond({ error: 'UNAVAILABLE', message: 'Albums unavailable' }, 503)
      : respond({
          items: [{ id: 'a', name: 'Trip' }],
          pagination: { page: Number(params.get('page')), limit: 50, total: 51, totalPages: 2 },
        });
  });
  render(<album.AlbumPicker />, setup());
  await screen.findByRole('option', { name: 'Trip' });
  fireEvent.click(screen.getByRole('button', { name: 'Next albums' }));
  await waitFor(() => expect(requests.at(-1).page).toBe('2'));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' cats & dogs ' } });
  await screen.findByRole('alert');
  expect(requests.at(-1)).toEqual({ page: '1', limit: '50', q: 'cats & dogs' });
  expect(screen.getByRole('alert')).toHaveTextContent('Albums unavailable');
});

it('debounces rapid album picker searches', async () => {
  const requests = [];
  vi.stubGlobal('fetch', async (url) => {
    requests.push(new URL(url, 'http://localhost').searchParams.get('q'));
    return respond({ items: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } });
  });
  render(<album.AlbumPicker />, setup());
  await screen.findByText('No albums found.');
  vi.useFakeTimers();
  try {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'c' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ca' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cats' } });
    expect(requests).toEqual([null]);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(requests).toEqual([null, 'cats']);
  } finally {
    vi.useRealTimers();
  }
});
