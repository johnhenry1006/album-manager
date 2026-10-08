import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { SearchPage } from './SearchPage.jsx';

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
function Location() {
  return <output aria-label="Current URL">{useLocation().search}</output>;
}
function setup(mediaResponse, path = '/search', optionResponse) {
  vi.stubGlobal('fetch', async (url) => {
    const parsed = new URL(url, 'http://localhost');
    requests.push(parsed);
    if (parsed.pathname === '/api/media') return mediaResponse(parsed.searchParams);
    if (optionResponse) return optionResponse(parsed);
    const page = Number(parsed.searchParams.get('page') || 1);
    const name = { '/api/albums': 'Album', '/api/categories': 'Category', '/api/tags': 'Tag' }[
      parsed.pathname
    ];
    if (!name) throw new Error(`Unexpected endpoint: ${parsed.pathname}`);
    return respond({
      items: [{ id: `${name}${page}`, name: `${name} ${page}` }],
      pagination: { page, limit: 50, total: 51, totalPages: 2 },
    });
  });
  const client = createQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Location />
        <Routes>
          <Route path="/search" element={<SearchPage />} />
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

it('restores all URL filters through GET media and renders thumbnail results', async () => {
  const { container } = setup(
    () => respond({ items: [item('photo')], hasMore: false, nextCursor: null }),
    '/search?q=beach&album=Album1&category=Category1&tag=Tag1&type=IMAGE&mimeType=image/jpeg&favorite=false&takenAtFrom=2026-01-01&takenAtTo=2026-01-02',
  );
  await screen.findByRole('button', { name: 'Open photo.jpg' });
  expect(
    Object.fromEntries(requests.find(({ pathname }) => pathname === '/api/media').searchParams),
  ).toMatchObject({
    q: 'beach',
    album: 'Album1',
    category: 'Category1',
    tag: 'Tag1',
    type: 'IMAGE',
    mimeType: 'image/jpeg',
    favorite: 'false',
    takenAtFrom: '2026-01-01T00:00:00.000Z',
    takenAtTo: '2026-01-02T23:59:59.999Z',
  });
  expect(screen.getByLabelText('Album')).toHaveValue('Album1');
  expect(container.querySelector('img')).toHaveAttribute('src', '/thumb-photo.webp');
  fireEvent.click(screen.getByRole('button', { name: 'Open photo.jpg' }));
  expect(screen.getByRole('heading', { name: 'Media details' })).toBeVisible();
});

it('updates URL filters and searches after keyword debounce, then clears filters', async () => {
  setup(() => respond({ items: [], hasMore: false, nextCursor: null }), '/search?view=grid');
  await screen.findByRole('option', { name: 'Album 1' });
  fireEvent.change(screen.getByLabelText('Album'), { target: { value: 'Album1' } });
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Category1' } });
  fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'Tag1' } });
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'VIDEO' } });
  fireEvent.change(screen.getByLabelText('File type (MIME)'), { target: { value: 'video/mp4' } });
  fireEvent.change(screen.getByLabelText('Favorite'), { target: { value: 'true' } });
  fireEvent.change(screen.getByLabelText('Search media'), { target: { value: 'summer' } });
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('q=summer');
  await waitFor(() =>
    expect(
      Object.fromEntries(
        requests.filter(({ pathname }) => pathname === '/api/media').at(-1).searchParams,
      ),
    ).toMatchObject({
      q: 'summer',
      album: 'Album1',
      category: 'Category1',
      tag: 'Tag1',
      type: 'VIDEO',
      mimeType: 'video/mp4',
      favorite: 'true',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.queryByText('Searching media…')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('?view=grid');
  expect(screen.getByLabelText('Album')).toHaveValue('');
  expect(screen.getByLabelText('Search media')).toHaveValue('');
  expect(screen.getByLabelText('File type (MIME)')).toHaveValue('');
});

it('paginates each option list while keeping previously selected options', async () => {
  setup(
    () => respond({ items: [], hasMore: false, nextCursor: null }),
    '/search?album=Album1&category=Category1&tag=Tag1',
  );
  await screen.findByRole('option', { name: 'Album 1' });
  for (const label of ['Album', 'Category', 'Tag']) {
    fireEvent.click(screen.getByRole('button', { name: `Next ${label.toLowerCase()} options` }));
    await screen.findByRole('option', { name: `${label} 2` });
    expect(screen.getByLabelText(label)).toHaveValue(`${label}1`);
    fireEvent.change(screen.getByLabelText(label), { target: { value: `${label}2` } });
  }
  await waitFor(() =>
    expect(
      Object.fromEntries(
        requests.filter(({ pathname }) => pathname === '/api/media').at(-1).searchParams,
      ),
    ).toMatchObject({ album: 'Album2', category: 'Category2', tag: 'Tag2' }),
  );
});

it('keeps ID selection across cursor pages and filters, and clears it explicitly', async () => {
  setup((query) =>
    respond({
      items: [item(query.has('cursor') ? 'second' : 'first')],
      hasMore: !query.has('cursor'),
      nextCursor: query.has('cursor') ? null : 'cursor+/=',
    }),
  );
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select first.jpg' }));
  await screen.findByRole('checkbox', { name: 'Select second.jpg' });
  expect(screen.getByRole('checkbox', { name: 'Select first.jpg' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Select loaded' }));
  expect(screen.getByRole('checkbox', { name: 'Select second.jpg' })).toBeChecked();
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'VIDEO' } });
  await waitFor(() =>
    expect(requests.some(({ searchParams }) => searchParams.get('type') === 'VIDEO')).toBe(true),
  );
  expect(screen.getByText(/2 selected/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByText(/0 selected/)).toBeVisible();
});

it('shows loading and empty search results', async () => {
  let resolve;
  setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  expect(screen.getByText('Loading media')).toBeVisible();
  resolve(respond({ items: [], hasMore: false, nextCursor: null }));
  await screen.findByRole('heading', { name: 'No media found' });
});

it('does not query incomplete MIME drafts and normalizes the completed value', async () => {
  setup(() => respond({ items: [item('photo')], hasMore: false, nextCursor: null }));
  await screen.findByRole('button', { name: 'Open photo.jpg' });
  const count = requests.filter(({ pathname }) => pathname === '/api/media').length;
  fireEvent.change(screen.getByLabelText('File type (MIME)'), { target: { value: 'image/' } });
  expect(screen.getByRole('alert')).toHaveTextContent('complete MIME type');
  expect(screen.getByLabelText('File type (MIME)')).toHaveAttribute('aria-invalid', 'true');
  expect(requests.filter(({ pathname }) => pathname === '/api/media')).toHaveLength(count);
  fireEvent.change(screen.getByLabelText('File type (MIME)'), { target: { value: 'IMAGE/JPEG' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(requests.filter(({ pathname }) => pathname === '/api/media')).toHaveLength(count);
  await waitFor(() => expect(requests.at(-1).searchParams.get('mimeType')).toBe('image/jpeg'));
  expect(screen.getByLabelText('File type (MIME)')).toHaveValue('IMAGE/JPEG');
});

it('blocks reversed date ranges and resumes after correction', async () => {
  setup(
    () => respond({ items: [], hasMore: false, nextCursor: null }),
    '/search?takenAtFrom=2026-02-02&takenAtTo=2026-02-01',
  );
  expect(screen.getByRole('alert')).toHaveTextContent('capture date');
  expect(requests.some(({ pathname }) => pathname === '/api/media')).toBe(false);
  fireEvent.change(screen.getByLabelText('Capture date to (UTC)'), {
    target: { value: '2026-02-03' },
  });
  await screen.findByRole('heading', { name: 'No media found' });
});

it('keeps loaded results and selection after a cursor failure and retries the same filters', async () => {
  let fail = true;
  setup((query) => {
    if (!query.has('cursor'))
      return respond({ items: [item('first')], hasMore: true, nextCursor: 'cursor+/=' });
    return fail
      ? respond({ error: 'UNAVAILABLE', message: 'Next page unavailable' }, 503)
      : respond({ items: [item('second')], hasMore: false, nextCursor: null });
  }, '/search?q=beach&album=Album1');
  expect(await screen.findByRole('alert')).toHaveTextContent('Next page unavailable');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select first.jpg' }));
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('checkbox', { name: 'Select second.jpg' });
  expect(screen.getByRole('checkbox', { name: 'Select first.jpg' })).toBeChecked();
  expect(
    requests
      .filter(({ searchParams }) => searchParams.has('cursor'))
      .map(({ searchParams }) => Object.fromEntries(searchParams)),
  ).toEqual([
    expect.objectContaining({ q: 'beach', album: 'Album1', cursor: 'cursor+/=' }),
    expect.objectContaining({ q: 'beach', album: 'Album1', cursor: 'cursor+/=' }),
  ]);
});

it('retries initial result and option failures independently', async () => {
  let mediaFail = true;
  let albumFail = true;
  setup(
    () =>
      mediaFail
        ? respond({ error: 'UNAVAILABLE', message: 'Media unavailable' }, 503)
        : respond({ items: [item('photo')], hasMore: false, nextCursor: null }),
    '/search',
    (url) => {
      if (url.pathname === '/api/albums' && albumFail)
        return respond({ error: 'UNAVAILABLE', message: 'Albums unavailable' }, 503);
      return respond({ items: [], pagination: { page: 1, totalPages: 1 } });
    },
  );
  await screen.findByText('Media unavailable');
  await screen.findByText('Albums unavailable');
  mediaFail = false;
  fireEvent.click(
    within(screen.getByText('Media unavailable').closest('[role="alert"]')).getByRole('button', {
      name: 'Try again',
    }),
  );
  await screen.findByRole('button', { name: 'Open photo.jpg' });
  albumFail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByText('Albums unavailable')).not.toBeInTheDocument());
});
