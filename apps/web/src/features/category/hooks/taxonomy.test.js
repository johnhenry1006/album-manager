import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as category from '@/features/category/index.js';
import * as tag from '@/features/tag/index.js';
import { createQueryClient } from '@/services/queryClient.js';

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

describe.each([
  {
    name: 'category',
    plural: 'categories',
    api: category,
    useList: 'useCategories',
    suffix: 'Category',
    ids: 'categoryIds',
  },
  { name: 'tag', plural: 'tags', api: tag, useList: 'useTags', suffix: 'Tag', ids: 'tagIds' },
])('$name feature', ({ name, plural, api, useList, suffix, ids }) => {
  it('paginates and isolates search filters while sharing equivalent defaults', async () => {
    const requests = [];
    const payload = {
      items: [{ id: 'one', name: 'One', slug: 'one' }],
      pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
    };
    vi.stubGlobal('fetch', async (url, options) => {
      requests.push({ url, signal: options.signal });
      return respond(payload);
    });
    const { wrapper } = setup();
    const list = renderHook(({ filters }) => api[useList](filters), {
      wrapper,
      initialProps: { filters: { page: 2, limit: 10, q: 'cats & dogs' } },
    });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    const url = new URL(requests[0].url, 'http://localhost');
    expect(url.pathname).toBe(`/api/${plural}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      limit: '10',
      q: 'cats & dogs',
    });
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(list.result.current.data).toEqual(payload);
    list.rerender({ filters: { q: 'birds' } });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(new URL(requests[1].url, 'http://localhost').searchParams.get('page')).toBe('1');
    list.rerender({ filters: {} });
    await waitFor(() => expect(requests).toHaveLength(3));
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    list.rerender({ filters: { page: 1, limit: 50 } });
    expect(requests).toHaveLength(3);
  });

  it('supports disabled queries and cancels abandoned requests', async () => {
    let signal;
    vi.stubGlobal('fetch', (_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason)),
      );
    });
    const list = renderHook(({ enabled }) => api[useList]({}, { enabled }), {
      ...setup(),
      initialProps: { enabled: false },
    });
    expect(signal).toBeUndefined();
    list.rerender({ enabled: true });
    await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
    list.unmount();
    expect(signal.aborted).toBe(true);
  });

  it.each(['Create', 'Update', 'Delete'])(
    '%s sends the documented mutation and refreshes affected caches',
    async (action) => {
      const requests = [];
      vi.stubGlobal('fetch', async (url, options) => {
        requests.push({ url, ...options });
        return respond({ id: 'one' }, action === 'Delete' ? 204 : 200);
      });
      const { client, wrapper } = setup();
      const listKey = [name, 'lists', { page: 1, limit: 50 }];
      const treeKey = [name, 'tree'];
      client.setQueryData(listKey, { items: [] });
      client.setQueryData(treeKey, { items: [] });
      client.setQueryData(['media', 'detail', 'm'], { id: 'm' });
      client.setQueryData(['media', 'lists', 'media', {}], { items: [] });
      client.setQueryData([name === 'tag' ? 'category' : 'tag', 'lists'], { items: [] });
      const mutation = renderHook(() => api[`use${action}${suffix}`](), { wrapper });
      const data = name === 'category' ? { name: 'Renamed', parentId: null } : { name: 'Renamed' };
      await act(() =>
        mutation.result.current.mutateAsync(
          action === 'Create' ? data : action === 'Update' ? { id: 'a/b', ...data } : 'a/b',
        ),
      );
      expect(requests[0].url).toBe(`/api/${plural}${action === 'Create' ? '' : '/a%2Fb'}`);
      expect(requests[0].method).toBe(
        { Create: 'POST', Update: 'PATCH', Delete: 'DELETE' }[action],
      );
      if (action !== 'Delete') expect(JSON.parse(requests[0].body)).toEqual(data);
      expect(client.getQueryState(listKey).isInvalidated).toBe(true);
      expect(client.getQueryState(treeKey).isInvalidated).toBe(true);
      expect(client.getQueryState(['media', 'detail', 'm']).isInvalidated).toBe(
        action !== 'Create',
      );
      expect(client.getQueryState(['media', 'lists', 'media', {}]).isInvalidated).toBe(
        action !== 'Create',
      );
      expect(
        client.getQueryState([name === 'tag' ? 'category' : 'tag', 'lists']).isInvalidated,
      ).toBe(false);
    },
  );

  it.each([false, true])(
    'assigns media with batch=%s and refreshes media filters and details',
    async (batch) => {
      const requests = [];
      vi.stubGlobal('fetch', async (url, options) => {
        requests.push({ url, ...options });
        return respond({ mediaIds: ['m'], [ids]: ['one'] });
      });
      const { wrapper, client } = setup();
      client.setQueryData(['media', 'detail', 'm'], { id: 'm' });
      client.setQueryData(['media', 'lists', 'media', { categoryId: 'one' }], { items: [] });
      const mutation = renderHook(
        () => api[`useAssignMedia${name === 'category' ? 'Categories' : 'Tags'}`](),
        { wrapper },
      );
      const variables = { [ids]: ['one'], ...(batch ? { mediaIds: ['m'] } : { mediaId: 'm' }) };
      await act(() => mutation.result.current.mutateAsync(variables));
      expect(requests[0].url).toBe(`/api/media/${batch ? '' : 'm/'}${plural}`);
      expect(requests[0].method).toBe('POST');
      expect(JSON.parse(requests[0].body)).toEqual({
        [ids]: ['one'],
        ...(batch ? { mediaIds: ['m'] } : {}),
      });
      expect(client.getQueryState(['media', 'detail', 'm']).isInvalidated).toBe(true);
      expect(
        client.getQueryState(['media', 'lists', 'media', { categoryId: 'one' }]).isInvalidated,
      ).toBe(true);
    },
  );

  it('surfaces server errors and preserves caches on failed mutations', async () => {
    vi.stubGlobal('fetch', async () =>
      respond({ error: 'CONFLICT', message: 'Conflict', requestId: 'r' }, 409),
    );
    const { wrapper, client } = setup();
    client.setQueryData([name, 'lists'], { items: [{ id: 'one' }] });
    client.setQueryData(['media', 'detail', 'm'], { id: 'm' });
    const mutation = renderHook(() => api[`useDelete${suffix}`](), { wrapper });
    await act(async () => {
      await expect(mutation.result.current.mutateAsync('one')).rejects.toMatchObject({
        status: 409,
        code: 'CONFLICT',
        requestId: 'r',
      });
    });
    expect(client.getQueryState([name, 'lists']).isInvalidated).toBe(false);
    expect(client.getQueryData([name, 'lists'])).toEqual({ items: [{ id: 'one' }] });
    expect(client.getQueryState(['media', 'detail', 'm']).isInvalidated).toBe(false);
    const list = renderHook(() => api[useList](), { wrapper });
    await waitFor(() => expect(list.result.current.isError).toBe(true));
    expect(list.result.current.error.status).toBe(409);
  });
});

it('fetches the category tree separately from paginated lists', async () => {
  const urls = [];
  vi.stubGlobal('fetch', async (url) => {
    urls.push(url);
    return respond({ items: [{ id: 'root', children: [] }] });
  });
  const { wrapper } = setup();
  const tree = renderHook(() => category.useCategories({ tree: true }), { wrapper });
  await waitFor(() => expect(tree.result.current.isSuccess).toBe(true));
  expect(urls).toEqual(['/api/categories?tree=true']);
  expect(tree.result.current.data.items[0].children).toEqual([]);
  const list = renderHook(() => category.useCategories(), { wrapper });
  await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
  expect(urls).toHaveLength(2);
});

it.each([
  { hook: category.useCategories, filters: { tree: true, page: 1 } },
  { hook: category.useCategories, filters: { tree: true, q: 'root' } },
  { hook: tag.useTags, filters: { tree: true } },
])('rejects incompatible tree filters before issuing a request', ({ hook, filters }) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(() => renderHook(() => hook(filters), setup())).toThrow(TypeError);
  expect(fetch).not.toHaveBeenCalled();
});

it.each([category.useAssignMediaCategories, tag.useAssignMediaTags])(
  'rejects missing or ambiguous assignment targets without changing caches',
  async (useAssign) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { wrapper, client } = setup();
    client.setQueryData(['media', 'detail', 'm'], { id: 'm' });
    const mutation = renderHook(() => useAssign(), { wrapper });
    for (const targets of [{}, { mediaId: 'm', mediaIds: ['m'] }]) {
      await act(async () => {
        await expect(
          mutation.result.current.mutateAsync({
            ...targets,
            categoryIds: ['one'],
            tagIds: ['one'],
          }),
        ).rejects.toThrow(TypeError);
      });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(client.getQueryState(['media', 'detail', 'm']).isInvalidated).toBe(false);
  },
);

it.each([
  { useList: category.useCategories, useUpdate: category.useUpdateCategory },
  { useList: tag.useTags, useUpdate: tag.useUpdateTag },
])('refreshes mounted filter consumers after updating metadata', async ({ useList, useUpdate }) => {
  let name = 'Before';
  vi.stubGlobal('fetch', async (_url, options) => {
    if (options.method === 'PATCH') {
      name = JSON.parse(options.body).name;
      return respond({ id: 'one', name });
    }
    return respond({
      items: [{ id: 'one', name }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });
  const { wrapper } = setup();
  const list = renderHook(() => useList(), { wrapper });
  const update = renderHook(() => useUpdate(), { wrapper });
  await waitFor(() => expect(list.result.current.data?.items[0].name).toBe('Before'));
  await act(() => update.result.current.mutateAsync({ id: 'one', name: 'After' }));
  await waitFor(() => expect(list.result.current.data.items[0].name).toBe('After'));
});
