import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { useUploadOptions } from './useUploadOptions.js';

it('debounces all upload option searches while leaving page navigation immediate', async () => {
  const client = createQueryClient();
  const requests = [];
  vi.stubGlobal('fetch', async (url) => {
    requests.push(new URL(url, 'http://localhost'));
    return new Response(JSON.stringify({ items: [], pagination: { page: 1, totalPages: 2 } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const hook = renderHook(() => useUploadOptions(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  try {
    await waitFor(() => expect(hook.result.current.tags.isLoading).toBe(false));
    expect(requests).toHaveLength(3);
    vi.useFakeTimers();
    for (const name of ['albums', 'categories', 'tags']) {
      act(() => hook.result.current[name].setSearch('c'));
      act(() => hook.result.current[name].setSearch('cats'));
    }
    expect(requests).toHaveLength(3);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(requests.slice(3).map((url) => url.searchParams.get('q'))).toEqual([
      'cats',
      'cats',
      'cats',
    ]);
    act(() => hook.result.current.albums.setPage(2));
    expect(requests.at(-1).searchParams.get('page')).toBe('2');
  } finally {
    hook.unmount();
    client.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
