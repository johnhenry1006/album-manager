import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { FavoritesPage } from './FavoritesPage.jsx';

const clients = [];
const requests = [];
const item = (id) => ({
  id,
  originalFilename: `${id}.jpg`,
  width: 800,
  height: 600,
  thumbnails: [{ width: 200, height: 150, url: `/thumb-${id}.webp` }],
});
function respond(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup(handler) {
  vi.stubGlobal('fetch', async (url, options) => {
    const parsed = new URL(url, 'http://localhost');
    const method = options?.method || 'GET';
    requests.push({ url: parsed, method });
    return handler(parsed, method);
  });
  const client = createQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/favorites']}>
        <Routes>
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/media/:mediaId" element={<h1>Media details</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(620);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(620);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  requests.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads favorites through the media list and opens thumbnail cards', async () => {
  const { container } = setup((url) => {
    expect(url.pathname).toBe('/api/media');
    expect(url.searchParams.get('favorite')).toBe('true');
    return respond({ items: [item('photo')], hasMore: false, nextCursor: null });
  });
  await screen.findByRole('button', { name: 'Open photo.jpg' });
  expect(container.querySelector('img')).toHaveAttribute('src', '/thumb-photo.webp');
  expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Open photo.jpg' }));
  expect(screen.getByRole('heading', { name: 'Media details' })).toBeVisible();
});

it('shows loading and empty favorites', async () => {
  let resolve;
  setup(() => new Promise((done) => (resolve = done)));
  expect(screen.getByText('Loading media')).toBeVisible();
  resolve(respond({ items: [], hasMore: false, nextCursor: null }));
  expect(await screen.findByRole('heading', { name: 'No favorites yet' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Select loaded' })).toBeDisabled();
});

it('retries initial failures through the media query', async () => {
  let fail = true;
  setup(() =>
    fail
      ? respond({ error: 'UNAVAILABLE', message: 'Favorites unavailable' }, 503)
      : respond({ items: [], hasMore: false, nextCursor: null }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Favorites unavailable');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'No favorites yet' });
});

it('preserves selection and loaded cards when pagination fails, then retries the cursor', async () => {
  let fail = true;
  let resolveNext;
  setup((url) => {
    if (!url.searchParams.has('cursor'))
      return respond({ items: [item('first')], hasMore: true, nextCursor: 'opaque+/=' });
    if (fail) return new Promise((done) => (resolveNext = done));
    return respond({ items: [item('second')], hasMore: false, nextCursor: null });
  });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select first.jpg' }));
  await waitFor(() => expect(resolveNext).toBeTypeOf('function'));
  resolveNext(respond({ error: 'UNAVAILABLE', message: 'Next page unavailable' }, 503));
  expect(await screen.findByRole('alert')).toHaveTextContent('Next page unavailable');
  expect(screen.getByRole('checkbox', { name: 'Select first.jpg' })).toBeChecked();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Open second.jpg' });
  expect(screen.getByRole('checkbox', { name: 'Select first.jpg' })).toBeChecked();
  expect(
    requests
      .filter(({ url }) => url.searchParams.has('cursor'))
      .map(({ url }) => url.searchParams.get('cursor')),
  ).toEqual(['opaque+/=', 'opaque+/=']);
  fireEvent.click(screen.getByRole('button', { name: 'Select loaded' }));
  expect(screen.getByRole('checkbox', { name: 'Select second.jpg' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('checkbox', { name: 'Select first.jpg' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Select second.jpg' })).not.toBeChecked();
});

it('removes favorites via media mutations, retaining failed IDs for retry', async () => {
  let remaining = [item('first'), item('second')];
  let fail = true;
  setup((url, method) => {
    if (method === 'GET') {
      expect(url.pathname).toBe('/api/media');
      expect(url.searchParams.get('favorite')).toBe('true');
      return respond({ items: remaining, hasMore: false, nextCursor: null });
    }
    expect(method).toBe('DELETE');
    if (url.pathname === '/api/media/second/favorite' && fail)
      return respond({ error: 'UNAVAILABLE', message: 'Could not remove second' }, 503);
    expect(['/api/media/first/favorite', '/api/media/second/favorite']).toContain(url.pathname);
    remaining = remaining.filter((media) => !url.pathname.includes(`/${media.id}/`));
    return respond(null);
  });
  await screen.findByRole('checkbox', { name: 'Select first.jpg' });
  fireEvent.click(screen.getByRole('button', { name: 'Select loaded' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove second');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Open first.jpg' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('checkbox', { name: 'Select second.jpg' })).toBeChecked();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));
  await screen.findByRole('heading', { name: 'No favorites yet' });
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(
    requests.filter(({ method }) => method === 'DELETE').map(({ url }) => url.pathname),
  ).toEqual([
    '/api/media/first/favorite',
    '/api/media/second/favorite',
    '/api/media/second/favorite',
  ]);
  expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeDisabled();
});

it('locks selection and prevents duplicate removals while a mutation is pending', async () => {
  let removed = false;
  let resolveRemove;
  setup((url, method) => {
    if (method === 'DELETE')
      return new Promise((done) => {
        resolveRemove = () => {
          removed = true;
          done(respond(null));
        };
      });
    return respond({ items: removed ? [] : [item('photo')], hasMore: false, nextCursor: null });
  });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select photo.jpg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));
  expect(screen.getByRole('checkbox', { name: 'Select photo.jpg' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Select loaded' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Removing…' }));
  await waitFor(() => expect(resolveRemove).toBeTypeOf('function'));
  resolveRemove();
  await screen.findByRole('heading', { name: 'No favorites yet' });
  expect(requests.filter(({ method }) => method === 'DELETE')).toHaveLength(1);
});
