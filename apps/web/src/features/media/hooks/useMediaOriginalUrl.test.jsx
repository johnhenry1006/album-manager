import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { useMediaOriginalUrl } from '../index.js';

const clients = [];
function setup() {
  const client = createQueryClient();
  clients.push(client);
  return renderHook(() => useMediaOriginalUrl(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

it('signs only on demand, encodes media IDs and does not participate in automatic cache refreshes', async () => {
  const requests = [];
  vi.stubGlobal('fetch', async (url) => {
    requests.push(url);
    return new Response(JSON.stringify({ url: 'https://assets.example/original.jpg' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const { result } = setup();
  expect(requests).toEqual([]);
  await act(() => result.current.mutateAsync('media/id'));
  expect(requests).toEqual(['/api/media/media%2Fid/original-url']);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data.url).toBe('https://assets.example/original.jpg');
  await act(() => clients[0].invalidateQueries({ queryKey: ['media'] }));
  expect(requests).toHaveLength(1);
});

it.each(['javascript:alert(1)', '/not-absolute', undefined])(
  'rejects invalid original links: %s',
  async (url) => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ url }), { headers: { 'Content-Type': 'application/json' } }),
    );
    const { result } = setup();
    act(() => result.current.mutate('photo'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.code).toBe('INVALID_RESPONSE');
    expect(result.current.data).toBeUndefined();
  },
);
