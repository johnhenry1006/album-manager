import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from './queryClient.js';

afterEach(() => vi.useRealTimers());

it('uses cached results for 30 seconds and fetches again when stale', async () => {
  vi.useFakeTimers();
  const client = createQueryClient();
  const queryFn = vi.fn().mockResolvedValue({ id: 'a1' });
  const query = { queryKey: ['album', 'a1'], queryFn };
  try {
    await client.fetchQuery(query);
    vi.advanceTimersByTime(29_999);
    await client.fetchQuery(query);
    expect(queryFn).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await client.fetchQuery(query);
    expect(queryFn).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});

it('does not automatically retry failed queries or mutations', async () => {
  const client = createQueryClient();
  const error = new Error('Failed');
  const queryFn = vi.fn().mockRejectedValue(error);
  const mutationFn = vi.fn().mockRejectedValue(error);
  try {
    await expect(client.fetchQuery({ queryKey: ['failure'], queryFn })).rejects.toBe(error);
    const mutation = client.getMutationCache().build(client, { mutationFn });
    await expect(mutation.execute()).rejects.toBe(error);
    expect(queryFn).toHaveBeenCalledOnce();
    expect(mutationFn).toHaveBeenCalledOnce();
  } finally {
    client.clear();
  }
});

it('isolates caches between clients', () => {
  const first = createQueryClient();
  const second = createQueryClient();
  first.setQueryData(['probe'], 'cached');
  expect(second.getQueryData(['probe'])).toBeUndefined();
  first.clear();
  second.clear();
});
