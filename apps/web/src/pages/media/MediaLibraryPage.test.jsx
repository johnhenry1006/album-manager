import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { MediaLibraryPage } from './MediaLibraryPage.jsx';

const clients = [];
const requests = [];
const item = (id) => ({
  id,
  originalFilename: `${id}.jpg`,
  width: 800,
  height: 600,
  thumbnails: [{ name: 'small', width: 200, height: 150, url: `/thumb-${id}.webp` }],
});
function respond(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup(path = '/media') {
  const client = createQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/media" element={<MediaLibraryPage />} />
          <Route path="/media/:mediaId" element={<h1>Media details</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function serve(mediaResponse) {
  vi.stubGlobal('fetch', async (url) => {
    const parsed = new URL(url, 'http://localhost');
    requests.push(parsed);
    if (parsed.pathname === '/api/media') return mediaResponse(parsed.searchParams);
    const page = Number(parsed.searchParams.get('page') || 1);
    const name = parsed.pathname === '/api/categories' ? 'Category' : 'Tag';
    return respond({
      items: [{ id: `${name}${page}`, name: `${name} ${page}` }],
      pagination: { page, limit: 50, total: 51, totalPages: 2 },
    });
  });
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

it('forwards restored filters, virtualizes thumbnails and opens media details', async () => {
  serve(() => respond({ items: [item('photo')], hasMore: false, nextCursor: null }));
  const { container } = setup(
    '/media?q=beach&type=IMAGE&category=Category1&tag=Tag1&favorite=true',
  );
  await screen.findByRole('button', { name: 'Open photo.jpg' });
  const query = requests.find(({ pathname }) => pathname === '/api/media').searchParams;
  expect(Object.fromEntries(query)).toMatchObject({
    q: 'beach',
    type: 'IMAGE',
    category: 'Category1',
    tag: 'Tag1',
    favorite: 'true',
  });
  expect(container.querySelector('img')).toHaveAttribute('src', '/thumb-photo.webp');
  fireEvent.click(screen.getByRole('button', { name: 'Open photo.jpg' }));
  expect(screen.getByRole('heading', { name: 'Media details' })).toBeVisible();
});

it('loads option pages through taxonomy hooks and applies a tag from the second page', async () => {
  serve(() => respond({ items: [], hasMore: false, nextCursor: null }));
  setup();
  await screen.findByRole('option', { name: 'Tag 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Next tag options' }));
  await screen.findByRole('option', { name: 'Tag 2' });
  fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'Tag2' } });
  await waitFor(() =>
    expect(
      requests.some(
        ({ pathname, searchParams }) =>
          pathname === '/api/media' && searchParams.get('tag') === 'Tag2',
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next category options' }));
  await screen.findByRole('option', { name: 'Category 2' });
});

it('shows loading, then an empty result', async () => {
  let resolve;
  serve(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  setup();
  expect(screen.getByText('Loading media')).toBeVisible();
  resolve(respond({ items: [], hasMore: false, nextCursor: null }));
  expect(await screen.findByRole('heading', { name: 'No media found' })).toBeVisible();
});

it('keeps loaded items after a pagination failure and retries the failed cursor', async () => {
  let fail = true;
  serve((query) => {
    if (!query.has('cursor'))
      return respond({ items: [item('first')], hasMore: true, nextCursor: 'opaque+/=' });
    return fail
      ? respond({ error: 'UNAVAILABLE', message: 'Media unavailable' }, 503)
      : respond({ items: [item('second')], hasMore: false, nextCursor: null });
  });
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Media unavailable');
  expect(screen.getByRole('button', { name: 'Open first.jpg' })).toBeVisible();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Open second.jpg' })).toBeVisible();
  expect(
    requests
      .filter(({ searchParams }) => searchParams.has('cursor'))
      .map(({ searchParams }) => searchParams.get('cursor')),
  ).toEqual(['opaque+/=', 'opaque+/=']);
});

it('retries an initial media error', async () => {
  let fail = true;
  serve(() =>
    fail
      ? respond({ error: 'UNAVAILABLE', message: 'Media unavailable' }, 503)
      : respond({ items: [], hasMore: false, nextCursor: null }),
  );
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Media unavailable');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'No media found' })).toBeVisible();
});

it('applies controls to API filters and clears them', async () => {
  serve(() => respond({ items: [], hasMore: false, nextCursor: null }));
  setup();
  await screen.findByRole('option', { name: 'Category 1' });
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'VIDEO' } });
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Category1' } });
  fireEvent.change(screen.getByLabelText('Favorite'), { target: { value: 'false' } });
  fireEvent.change(screen.getByLabelText('Capture date from (UTC)'), {
    target: { value: '2026-01-01' },
  });
  fireEvent.change(screen.getByLabelText('Capture date to (UTC)'), {
    target: { value: '2026-01-02' },
  });
  fireEvent.change(screen.getByLabelText('Search media'), { target: { value: 'summer' } });
  await waitFor(() =>
    expect(
      Object.fromEntries(
        requests.filter(({ pathname }) => pathname === '/api/media').at(-1).searchParams,
      ),
    ).toMatchObject({
      q: 'summer',
      type: 'VIDEO',
      category: 'Category1',
      favorite: 'false',
      takenAtFrom: '2026-01-01T00:00:00.000Z',
      takenAtTo: '2026-01-02T23:59:59.999Z',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.queryByText('Searching media…')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Search media')).toHaveValue('');
  expect(screen.getByLabelText('Favorite')).toHaveValue('');
  expect(screen.getByLabelText('Capture date from (UTC)')).toHaveValue('');
});

it('does not request media for a reversed date range and resumes after correction', async () => {
  serve(() => respond({ items: [], hasMore: false, nextCursor: null }));
  setup('/media?takenAtFrom=2026-02-02&takenAtTo=2026-02-01');
  expect(screen.getByRole('alert')).toHaveTextContent('capture date');
  expect(requests.some(({ pathname }) => pathname === '/api/media')).toBe(false);
  fireEvent.change(screen.getByLabelText('Capture date to (UTC)'), {
    target: { value: '2026-02-03' },
  });
  await screen.findByRole('heading', { name: 'No media found' });
  expect(requests.some(({ pathname }) => pathname === '/api/media')).toBe(true);
});

it('keeps media usable when tag options fail and allows retrying options', async () => {
  let fail = true;
  vi.stubGlobal('fetch', async (url) => {
    const { pathname } = new URL(url, 'http://localhost');
    if (pathname === '/api/media')
      return respond({ items: [item('photo')], hasMore: false, nextCursor: null });
    if (pathname === '/api/tags' && fail)
      return respond({ error: 'UNAVAILABLE', message: 'Tags unavailable' }, 503);
    return respond({
      items: [{ id: 'option', name: 'Available option' }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Tags unavailable');
  expect(await screen.findByRole('button', { name: 'Open photo.jpg' })).toBeVisible();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Tag')).toBeEnabled();
});
