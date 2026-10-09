import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { TrashPage } from './TrashPage.jsx';

const clients = [];
const requests = [];
const item = (id) => ({
  id,
  canRestore: true,
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
      <MemoryRouter initialEntries={['/trash']}>
        <Routes>
          <Route path="/trash" element={<TrashPage />} />
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

it('shows loading and empty trash', async () => {
  let resolve;
  setup(() => new Promise((done) => (resolve = done)));
  expect(screen.getByText('Loading media')).toBeVisible();
  resolve(respond({ items: [], hasMore: false, nextCursor: null }));
  expect(await screen.findByRole('heading', { name: 'Trash is empty' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Select loaded' })).toBeDisabled();
});

it('retries initial failures through the trash query', async () => {
  let fail = true;
  setup(() =>
    fail
      ? respond({ error: 'UNAVAILABLE', message: 'Trash unavailable' }, 503)
      : respond({ items: [], hasMore: false, nextCursor: null }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Trash unavailable');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Trash is empty' });
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
  await screen.findByRole('checkbox', { name: 'Select second.jpg' });
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

it('restores selected media and retains failed IDs for retry', async () => {
  let remaining = [item('first'), item('second')];
  setup((url, method) => {
    if (method === 'GET') return respond({ items: remaining, hasMore: false, nextCursor: null });
    expect(method).toBe('POST');
    if (url.pathname === '/api/trash/second/restore')
      return respond({ error: 'UNAVAILABLE', message: 'Restore failed' }, 503);
    expect(url.pathname).toBe('/api/trash/first/restore');
    remaining = remaining.filter(({ id }) => id !== 'first');
    return respond(null);
  });
  await screen.findByRole('checkbox', { name: 'Select first.jpg' });
  fireEvent.click(screen.getByRole('button', { name: 'Select loaded' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore selected' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Restore failed');
  expect(screen.getByRole('checkbox', { name: 'Select second.jpg' })).toBeChecked();
  expect(screen.getByText(/1 selected/)).toBeVisible();
});

it('requires confirmation, supports cancellation and locks selection during permanent deletion', async () => {
  let resolveDelete;
  let removed = false;
  setup((_url, method) => {
    if (method === 'DELETE')
      return new Promise((done) => {
        resolveDelete = () => {
          removed = true;
          done(respond(null));
        };
      });
    return respond({ items: removed ? [] : [item('photo')], hasMore: false, nextCursor: null });
  });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select photo.jpg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Permanently delete selected' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('cannot be undone');
  expect(requests.filter(({ method }) => method === 'DELETE')).toHaveLength(0);
  expect(screen.getByRole('checkbox', { name: 'Select photo.jpg' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Select photo.jpg' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Permanently delete selected' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
  expect(screen.getByRole('button', { name: 'Restore selected' })).toBeDisabled();
  await waitFor(() => expect(resolveDelete).toBeTypeOf('function'));
  resolveDelete();
  await screen.findByRole('heading', { name: 'Trash is empty' });
  expect(
    requests.filter(({ method }) => method === 'DELETE').map(({ url }) => url.pathname),
  ).toEqual(['/api/trash/photo/permanent']);
});

it('uses thumbnails and refuses restoration of media with a purge in progress', async () => {
  const { container } = setup((url) => {
    expect(url.pathname).toBe('/api/trash');
    expect([...url.searchParams.keys()]).toEqual(['limit']);
    return respond({
      items: [{ ...item('photo'), canRestore: false }],
      hasMore: false,
      nextCursor: null,
    });
  });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select photo.jpg' }));
  expect(container.querySelector('img')).toHaveAttribute('src', '/thumb-photo.webp');
  expect(screen.getByRole('button', { name: 'Restore selected' })).toBeDisabled();
  expect(screen.getByText(/cannot be restored/)).toBeVisible();
});
