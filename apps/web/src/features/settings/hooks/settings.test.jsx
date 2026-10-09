import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import {
  settingsQueryKeys,
  useImageOptimizationSettings,
  useStorageSettings,
  useUpdateImageOptimizationSettings,
} from '../index.js';

const initial = {
  optimizationMode: 'BALANCED',
  optimizedMaxWidth: 2560,
  optimizedMaxHeight: 2560,
  previewMaxWidth: 1600,
  previewMaxHeight: 1600,
  thumbnailSizes: [800, 400, 200],
  outputFormat: 'webp',
  balancedQuality: 80,
  highQuality: 90,
  maximumCompressionQuality: 60,
  keepOriginal: true,
};
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

it('shares current optimization settings with cancellation-aware HTTP reads', async () => {
  const fetch = vi.fn(async (url, options) => {
    expect(url).toBe('/api/settings/image-optimization');
    expect(options.method).toBe('GET');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return respond(initial);
  });
  vi.stubGlobal('fetch', fetch);
  const { client, wrapper } = setup();
  const first = renderHook(() => useImageOptimizationSettings(), { wrapper });
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
  const second = renderHook(() => useImageOptimizationSettings(), { wrapper });
  expect(second.result.current.data).toEqual(initial);
  expect(client.getQueryData(settingsQueryKeys.imageOptimization())).toEqual(initial);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('PATCHes partial settings and refreshes only the optimization cache', async () => {
  let current = initial;
  const fetch = vi.fn(async (url, options) => {
    expect(url).toBe('/api/settings/image-optimization');
    if (options.method === 'PATCH') {
      expect(options.headers.get('Content-Type')).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ balancedQuality: 73 });
      current = { ...initial, balancedQuality: 73 };
    }
    return respond(current);
  });
  vi.stubGlobal('fetch', fetch);
  const { client, wrapper } = setup();
  client.setQueryData(settingsQueryKeys.storage(), {
    providerType: 's3',
    bucketName: 'photos',
    originalBytes: '1024',
    optimizedBytes: '512',
    variantBytes: '768',
    totalBytes: '1792',
    estimatedSavedBytes: '512',
    objectCount: 3,
  });
  const read = renderHook(() => useImageOptimizationSettings(), { wrapper });
  const update = renderHook(() => useUpdateImageOptimizationSettings(), { wrapper });
  await waitFor(() => expect(read.result.current.isSuccess).toBe(true));
  expect(read.result.current.data).toEqual(initial);
  let saved;
  await act(async () => {
    saved = await update.result.current.mutateAsync({ balancedQuality: 73 });
  });
  expect(saved).toEqual({ ...initial, balancedQuality: 73 });
  await waitFor(() => expect(read.result.current.data.balancedQuality).toBe(73));
  expect(client.getQueryData(settingsQueryKeys.imageOptimization()).balancedQuality).toBe(73);
  expect(client.getQueryState(settingsQueryKeys.storage()).isInvalidated).toBe(false);
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(1);
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'GET')).toHaveLength(2);
});

it('keeps cached settings after an unsuccessful mutation and exposes normalized errors', async () => {
  const fetch = vi.fn(async () =>
    respond({ error: 'HTTP_ERROR', message: 'Request failed', requestId: 'r1' }, 400),
  );
  vi.stubGlobal('fetch', fetch);
  const { client, wrapper } = setup();
  client.setQueryData(settingsQueryKeys.imageOptimization(), initial);
  const hook = renderHook(() => useUpdateImageOptimizationSettings(), { wrapper });
  await act(async () => {
    await expect(hook.result.current.mutateAsync({ keepOriginal: false })).rejects.toMatchObject({
      status: 400,
      code: 'HTTP_ERROR',
      requestId: 'r1',
    });
  });
  expect(client.getQueryData(settingsQueryKeys.imageOptimization())).toEqual(initial);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('caches only public storage metadata and isolates storage from optimization queries', async () => {
  vi.stubGlobal('fetch', async (url, options) => {
    expect(url).toBe('/api/settings/storage');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return respond({
      providerType: 's3',
      bucketName: 'photos',
      originalBytes: '1024',
      optimizedBytes: '512',
      variantBytes: '768',
      totalBytes: '1792',
      estimatedSavedBytes: '512',
      objectCount: 3,
      accessKey: 'private-access',
      secretAccessKey: 'private-secret',
      password: 'private-password',
      endpoint: 'https://user:password@internal.example',
      credentials: { token: 'private-token' },
    });
  });
  const { client, wrapper } = setup();
  const hook = renderHook(() => useStorageSettings(), { wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(hook.result.current.data).toEqual({
    providerType: 's3',
    bucketName: 'photos',
    originalBytes: '1024',
    optimizedBytes: '512',
    variantBytes: '768',
    totalBytes: '1792',
    estimatedSavedBytes: '512',
    objectCount: 3,
  });
  expect(client.getQueryData(settingsQueryKeys.storage())).toEqual({
    providerType: 's3',
    bucketName: 'photos',
    originalBytes: '1024',
    optimizedBytes: '512',
    variantBytes: '768',
    totalBytes: '1792',
    estimatedSavedBytes: '512',
    objectCount: 3,
  });
  expect(client.getQueryData(settingsQueryKeys.imageOptimization())).toBeUndefined();
});

it('excludes unexpected credentials from optimization query and mutation results before caching', async () => {
  vi.stubGlobal('fetch', async () => respond({ ...initial, secretAccessKey: 'private-secret' }));
  const { client, wrapper } = setup();
  const read = renderHook(() => useImageOptimizationSettings(), { wrapper });
  await waitFor(() => expect(read.result.current.isSuccess).toBe(true));
  expect(read.result.current.data).toEqual(initial);
  const update = renderHook(() => useUpdateImageOptimizationSettings(), { wrapper });
  await act(async () => {
    await update.result.current.mutateAsync({ balancedQuality: 80 });
  });
  await waitFor(() => expect(update.result.current.data).toEqual(initial));
  expect(client.getQueryData(settingsQueryKeys.imageOptimization())).toEqual(initial);
});

it.each([
  ['optimization', useImageOptimizationSettings],
  ['storage', useStorageSettings],
])('cancels an in-flight %s query on unmount', async (_name, useSettings) => {
  let signal;
  vi.stubGlobal('fetch', (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason)),
    );
  });
  const hook = renderHook(() => useSettings(), setup());
  await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
  hook.unmount();
  expect(signal.aborted).toBe(true);
});

it.each([
  ['optimization', useImageOptimizationSettings],
  ['storage', useStorageSettings],
])(
  'exposes %s query failures without retries or fabricated defaults',
  async (_name, useSettings) => {
    const fetch = vi.fn(async () =>
      respond({ error: 'HTTP_ERROR', message: 'Route not found', requestId: 'r2' }, 404),
    );
    vi.stubGlobal('fetch', fetch);
    const hook = renderHook(() => useSettings(), setup());
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.error).toMatchObject({ status: 404, requestId: 'r2' });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it.each([
  null,
  [],
  { providerType: { secret: 'hidden' } },
  { bucketName: ['hidden'] },
  { totalBytes: 9 },
  { originalBytes: '-1' },
  { optimizedBytes: 'signed-secret' },
  { objectCount: 1.5 },
  { endpointHost: 'user:secret@host' },
])('rejects malformed public storage metadata: %j', async (body) => {
  vi.stubGlobal('fetch', async () => respond(body));
  const { client, wrapper } = setup();
  const hook = renderHook(() => useStorageSettings(), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.error).toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(client.getQueryData(settingsQueryKeys.storage())).toBeUndefined();
});

it('exports consumer hooks and query keys without exposing the private API adapter', async () => {
  const feature = await import('../index.js');
  expect(Object.keys(feature).sort()).toEqual([
    'settingsQueryKeys',
    'useImageOptimizationSettings',
    'useStorageSettings',
    'useUpdateImageOptimizationSettings',
  ]);
});

it.each([
  null,
  [],
  {},
  { ...initial, keepOriginal: false },
  { ...initial, optimizationMode: 'OTHER' },
  { ...initial, outputFormat: 'jpeg' },
  { ...initial, optimizedMaxWidth: 0 },
  { ...initial, optimizedMaxHeight: 16384 },
  { ...initial, previewMaxWidth: '800' },
  { ...initial, previewMaxHeight: 1.5 },
  { ...initial, balancedQuality: 0 },
  { ...initial, highQuality: 101 },
  { ...initial, maximumCompressionQuality: null },
  { ...initial, thumbnailSizes: [] },
  { ...initial, thumbnailSizes: [400, 400] },
])('rejects invalid optimization responses without retaining their contents: %j', async (body) => {
  vi.stubGlobal('fetch', async () => respond(body));
  const { client, wrapper } = setup();
  const hook = renderHook(() => useImageOptimizationSettings(), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.error).toMatchObject({
    code: 'INVALID_RESPONSE',
    message: 'Invalid settings response.',
  });
  expect(hook.result.current.error.cause).toBeUndefined();
  expect(client.getQueryData(settingsQueryKeys.imageOptimization())).toBeUndefined();
});
