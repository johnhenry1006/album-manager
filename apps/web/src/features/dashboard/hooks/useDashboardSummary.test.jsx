import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { dashboardQueryKeys, useDashboardSummary } from '../index.js';

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

it('shares fresh summary data between consumers and refreshes on demand', async () => {
  const fetch = vi.fn(async (url, options) => {
    expect(url).toBe('/api/dashboard');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return respond({ counts: { media: fetch.mock.calls.length } });
  });
  vi.stubGlobal('fetch', fetch);
  const { client, wrapper } = setup();
  const first = renderHook(() => useDashboardSummary(), { wrapper });
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
  const second = renderHook(() => useDashboardSummary(), { wrapper });
  expect(second.result.current.data.counts.media).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(dashboardQueryKeys.summary())).toEqual({ counts: { media: 1 } });
  await act(() => first.result.current.refetch());
  await waitFor(() => expect(second.result.current.data.counts.media).toBe(2));
});

it('cancels an in-flight summary request after its last consumer unmounts', async () => {
  let signal;
  vi.stubGlobal('fetch', (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason)),
    );
  });
  const hook = renderHook(() => useDashboardSummary(), setup());
  await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
  hook.unmount();
  expect(signal.aborted).toBe(true);
});

it('exposes the normalized API error and leaves retry to the consumer', async () => {
  const fetch = vi.fn(async () =>
    respond({ error: 'UNAVAILABLE', message: 'Dashboard unavailable', requestId: 'r' }, 503),
  );
  vi.stubGlobal('fetch', fetch);
  const hook = renderHook(() => useDashboardSummary(), setup());
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.error).toMatchObject({
    status: 503,
    code: 'UNAVAILABLE',
    message: 'Dashboard unavailable',
    requestId: 'r',
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
