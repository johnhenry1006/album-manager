import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { AlbumListPage } from './AlbumListPage.jsx';

const clients = [];
const requests = [];
const item = (name = 'Trip') => ({
  id: name,
  name,
  description: 'Summer memories',
  visibility: 'PUBLIC',
  coverMediaId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
});
const respond = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function Location() {
  return <span aria-label="Location">{useLocation().search}</span>;
}
function setup(path = '/albums') {
  const client = createQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Location />
        <Routes>
          <Route path="/albums" element={<AlbumListPage />} />
          <Route path="/albums/:albumId" element={<h1>Album details</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function serve(handler) {
  vi.stubGlobal('fetch', async (url, options) => {
    const parsed = new URL(url, 'http://localhost');
    requests.push({ ...options, url: parsed });
    return handler(parsed.searchParams, options);
  });
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  requests.length = 0;
  vi.unstubAllGlobals();
});

it('restores filters, sort and list mode, paginates, and links to album details', async () => {
  serve((params) =>
    respond({
      items: [item(`Trip ${params.get('page')}`)],
      pagination: { page: Number(params.get('page')), limit: 12, total: 25, totalPages: 3 },
    }),
  );
  const view = setup('/albums?q=summer&visibility=PUBLIC&sort=name&view=list&page=2&limit=12');
  await screen.findByRole('link', { name: /Trip 2/ });
  expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
    page: '2',
    limit: '12',
    q: 'summer',
    visibility: 'PUBLIC',
    sort: 'name',
  });
  expect(screen.getByLabelText('View')).toHaveValue('list');
  expect(view.container.querySelector('[data-view="list"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByRole('link', { name: /Trip 3/ });
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  fireEvent.click(screen.getByRole('link', { name: /Trip 3/ }));
  expect(screen.getByRole('heading', { name: 'Album details' })).toBeVisible();
});

it('changes server filters from page one while view changes preserve the page', async () => {
  serve((params) =>
    respond({
      items: [item()],
      pagination: { page: Number(params.get('page')), limit: 24, total: 50, totalPages: 3 },
    }),
  );
  setup('/albums?page=2&keep=1');
  await screen.findByRole('link', { name: /Trip/ });
  fireEvent.change(screen.getByLabelText('View'), { target: { value: 'list' } });
  expect(requests).toHaveLength(1);
  expect(screen.getByLabelText('Location')).toHaveTextContent('page=2');
  fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'PRIVATE' } });
  await waitFor(() => expect(requests.at(-1).url.searchParams.get('visibility')).toBe('PRIVATE'));
  expect(requests.at(-1).url.searchParams.get('page')).toBe('1');
  fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'oldest' } });
  await waitFor(() => expect(requests.at(-1).url.searchParams.get('sort')).toBe('oldest'));
  fireEvent.change(screen.getByLabelText('Search albums'), { target: { value: ' cats & dogs ' } });
  await waitFor(() => expect(requests.at(-1).url.searchParams.get('q')).toBe('cats & dogs'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(requests.at(-1).url.searchParams.has('q')).toBe(false));
  expect(screen.getByLabelText('Visibility')).toHaveValue('');
  expect(screen.getByLabelText('View')).toHaveValue('list');
  expect(screen.getByLabelText('Location')).toHaveTextContent('keep=1');
});

it('shows loading, empty results, and a recoverable error', async () => {
  let resolve;
  let first = true;
  serve(() =>
    first
      ? new Promise((done) => {
          resolve = done;
        })
      : respond({ items: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 0 } }),
  );
  setup();
  expect(screen.getByRole('status')).toHaveTextContent('Loading albums');
  resolve(respond({ error: 'UNAVAILABLE', message: 'Albums unavailable' }, 503));
  expect(await screen.findByRole('alert')).toHaveTextContent('Albums unavailable');
  first = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'No albums found' });
});

it('creates an album, resets list filters, and exposes the refreshed album', async () => {
  let created = false;
  serve((_params, options) => {
    if (options.method === 'POST') {
      created = true;
      return respond(item('New album'), 201);
    }
    return respond({
      items: created ? [item('New album')] : [],
      pagination: { page: 1, limit: 24, total: created ? 1 : 0, totalPages: created ? 1 : 0 },
    });
  });
  setup('/albums?visibility=PRIVATE&sort=oldest');
  await screen.findByRole('heading', { name: 'No albums found' });
  fireEvent.click(screen.getByRole('button', { name: 'Create album' }));
  fireEvent.change(screen.getByLabelText('Album name'), { target: { value: ' New album ' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Memories' } });
  fireEvent.change(screen.getByLabelText('Album visibility'), { target: { value: 'PUBLIC' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save album' }));
  await screen.findByRole('link', { name: /New album/ });
  expect(JSON.parse(requests.find((request) => request.method === 'POST').body)).toEqual({
    name: 'New album',
    description: 'Memories',
    visibility: 'PUBLIC',
  });
  await waitFor(() => expect(screen.queryByLabelText('Album name')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Visibility')).toHaveValue('');
  expect(screen.getByLabelText('Sort')).toHaveValue('newest');
});

it('keeps create input after failure and prevents duplicate submissions while pending', async () => {
  let resolve;
  serve((_params, options) =>
    options.method === 'POST'
      ? new Promise((done) => {
          resolve = done;
        })
      : respond({ items: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 0 } }),
  );
  setup();
  await screen.findByRole('heading', { name: 'No albums found' });
  fireEvent.click(screen.getByRole('button', { name: 'Create album' }));
  fireEvent.change(screen.getByLabelText('Album name'), { target: { value: 'Trip' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save album' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
  resolve(respond({ error: 'CONFLICT', message: 'Album conflict' }, 409));
  expect(await screen.findByRole('alert')).toHaveTextContent('Album conflict');
  expect(screen.getByLabelText('Album name')).toHaveValue('Trip');
});

it('recovers an out-of-range page and changes page size from page one', async () => {
  serve((params) =>
    respond({
      items: params.get('page') === '9' ? [] : [item()],
      pagination: {
        page: Number(params.get('page')),
        limit: Number(params.get('limit')),
        total: 30,
        totalPages: 2,
      },
    }),
  );
  setup('/albums?page=9');
  await screen.findByRole('link', { name: /Trip/ });
  expect(requests.at(-1).url.searchParams.get('page')).toBe('2');
  fireEvent.change(screen.getByLabelText('Albums per page'), { target: { value: '12' } });
  await waitFor(() => expect(requests.at(-1).url.searchParams.get('limit')).toBe('12'));
  expect(requests.at(-1).url.searchParams.get('page')).toBe('1');
});

it('shows the server page-size cap and keeps capped pagination usable', async () => {
  serve((params) =>
    respond({
      items: [item()],
      pagination: { page: Number(params.get('page')), limit: 10, total: 21, totalPages: 3 },
    }),
  );
  setup();
  await screen.findByRole('link', { name: /Trip/ });
  expect(screen.getByLabelText('Albums per page')).toHaveValue('10');
  expect(screen.queryByRole('option', { name: '24' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(requests.at(-1).url.searchParams.get('page')).toBe('2'));
});

it('retains a nonstandard server maximum after choosing a smaller page size', async () => {
  serve((params) =>
    respond({
      items: [item()],
      pagination: {
        page: Number(params.get('page')),
        limit: Math.min(Number(params.get('limit')), 20),
        total: 40,
        totalPages: 4,
      },
    }),
  );
  setup();
  await screen.findByRole('link', { name: /Trip/ });
  expect(screen.getByRole('option', { name: '20' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Albums per page'), { target: { value: '12' } });
  await waitFor(() => expect(requests.at(-1).url.searchParams.get('limit')).toBe('12'));
  await waitFor(() => expect(screen.getByLabelText('Albums per page')).toHaveValue('12'));
  expect(screen.getByRole('option', { name: '20' })).toBeInTheDocument();
});

it('rejects a blank trimmed name and cancels creation without sending a request', async () => {
  serve(() => respond({ items: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 0 } }));
  setup();
  await screen.findByRole('heading', { name: 'No albums found' });
  fireEvent.click(screen.getByRole('button', { name: 'Create album' }));
  fireEvent.change(screen.getByLabelText('Album name'), { target: { value: '   ' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Create album' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter an album name');
  expect(requests.some((request) => request.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Album name')).not.toBeInTheDocument();
});

it('renders only thumbnail covers through public feature components', async () => {
  vi.stubGlobal('fetch', async (url) => {
    if (url.startsWith('/api/media/'))
      return respond({
        id: 'm',
        variants: [
          { type: 'ORIGINAL', url: '/original' },
          { type: 'PREVIEW', url: '/preview' },
          { type: 'THUMBNAIL', url: '/thumb', width: 200, height: 100 },
        ],
      });
    return respond({
      items: [{ ...item(), coverMediaId: 'm' }],
      pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
    });
  });
  setup();
  await waitFor(() =>
    expect(screen.getByRole('img', { name: 'Trip cover' })).toHaveAttribute('src', '/thumb'),
  );
});
