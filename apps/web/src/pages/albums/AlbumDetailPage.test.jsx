import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { AlbumDetailPage } from './AlbumDetailPage.jsx';

const clients = [];
const requests = [];
const media = (id) => ({
  id,
  membershipId: `member-${id}`,
  position: 0,
  type: 'IMAGE',
  favorite: false,
  originalFilename: `${id}.jpg`,
  thumbnails: [{ url: `/thumb-${id}`, width: 200, height: 100 }],
});
const album = {
  id: 'a',
  name: 'Trip',
  description: 'Summer memories',
  visibility: 'PRIVATE',
  coverMediaId: null,
  counts: { media: 2, images: 2, videos: 0 },
};
const respond = (body, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function setup(path = '/albums/a') {
  const client = createQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Link to="/albums/b">Other album</Link>
        <Routes>
          <Route path="/albums/:albumId" element={<AlbumDetailPage />} />
          <Route path="/media/:mediaId" element={<h1>Media details</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function serve(handler) {
  vi.stubGlobal('fetch', async (url, options) => {
    requests.push({ url: new URL(url, 'http://localhost'), ...options });
    return handler(new URL(url, 'http://localhost'), options);
  });
}
function defaultResponse(url) {
  if (url.pathname === '/api/albums/a') return respond(album);
  return respond({ items: [media('one'), media('two')], hasMore: false, nextCursor: null });
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

it('shows album information/counts, restores server filters, and opens a media detail', async () => {
  serve(defaultResponse);
  setup('/albums/a?q=summer&type=IMAGE&favorite=false');
  await screen.findByRole('button', { name: 'Open one.jpg' });
  expect(screen.getByRole('heading', { name: 'Trip' })).toBeVisible();
  expect(screen.getByText('Summer memories')).toBeVisible();
  expect(screen.getByText(/2 media/)).toBeVisible();
  const params = requests.find(({ url }) => url.pathname === '/api/albums/a/media').url
    .searchParams;
  expect(Object.fromEntries(params)).toMatchObject({
    q: 'summer',
    type: 'IMAGE',
    favorite: 'false',
  });
  expect(screen.getByRole('img', { name: 'one.jpg' })).toHaveAttribute('src', '/thumb-one');
  fireEvent.click(screen.getByRole('button', { name: 'Open one.jpg' }));
  expect(screen.getByRole('heading', { name: 'Media details' })).toBeVisible();
});
it('changes album filters without losing ID selection', async () => {
  serve(defaultResponse);
  setup();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select one.jpg' }));
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'VIDEO' } });
  await waitFor(() => expect(requests.at(-1).url.searchParams.get('type')).toBe('VIDEO'));
  expect(screen.getByText('1 selected')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Search album media'), { target: { value: 'beach' } });
  await waitFor(() => expect(requests.at(-1).url.searchParams.get('q')).toBe('beach'));
});
it('removes selected memberships and retains failed IDs for retry', async () => {
  const removed = new Set();
  serve((url, options) => {
    if (options.method === 'DELETE') {
      if (url.pathname.endsWith('/two'))
        return respond({ error: 'UNAVAILABLE', message: 'Membership unavailable' }, 503);
      removed.add('one');
      return respond(null, 204);
    }
    if (url.pathname === '/api/albums/a')
      return respond({ ...album, counts: { ...album.counts, media: 2 - removed.size } });
    return respond({
      items: ['one', 'two'].filter((id) => !removed.has(id)).map(media),
      hasMore: false,
      nextCursor: null,
    });
  });
  setup();
  await screen.findByRole('checkbox', { name: 'Select one.jpg' });
  fireEvent.click(screen.getByRole('button', { name: 'Select loaded media' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected from album' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Membership unavailable');
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove 1 selected media');
  expect(screen.getByText('1 selected')).toBeVisible();
  expect(
    requests.filter(({ method }) => method === 'DELETE').map(({ url }) => url.pathname),
  ).toEqual(['/api/albums/a/media/one', '/api/albums/a/media/two']);
});
it('favorites selected media through individual feature actions and refreshes the album gallery', async () => {
  serve((url, options) => (options.method === 'POST' ? respond(null, 204) : defaultResponse(url)));
  setup();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select one.jpg' }));
  const before = requests.filter(({ url }) => url.pathname === '/api/albums/a/media').length;
  fireEvent.click(screen.getByRole('button', { name: 'Favorite selected' }));
  await waitFor(() => expect(screen.getByText('0 selected')).toBeVisible());
  expect(
    requests.some(
      ({ url, method }) => method === 'POST' && url.pathname === '/api/media/one/favorite',
    ),
  ).toBe(true);
  expect(
    requests.filter(({ url }) => url.pathname === '/api/albums/a/media').length,
  ).toBeGreaterThan(before);
});
it('sets the cover from a single selected member', async () => {
  let cover = null;
  serve((url, options) => {
    if (options.method === 'PATCH') {
      cover = JSON.parse(options.body).coverMediaId;
      return respond({ ...album, coverMediaId: cover });
    }
    if (url.pathname === '/api/albums/a') return respond({ ...album, coverMediaId: cover });
    if (url.pathname === '/api/media/one') return respond(media('one'));
    return defaultResponse(url);
  });
  setup();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select one.jpg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set selected as cover' }));
  await waitFor(() => expect(cover).toBe('one'));
  await waitFor(() =>
    expect(screen.getByRole('img', { name: 'Trip cover' })).toHaveAttribute('src', '/thumb-one'),
  );
});
it('adds existing media through a second virtualized picker without loading it on initial mount', async () => {
  serve((url, options) =>
    options.method === 'POST'
      ? respond({ membershipId: 'new' })
      : url.pathname === '/api/media'
        ? respond({ items: [media('new')], hasMore: false, nextCursor: null })
        : defaultResponse(url),
  );
  setup();
  await screen.findByRole('button', { name: 'Open one.jpg' });
  expect(requests.some(({ url }) => url.pathname === '/api/media')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Add media' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select new.jpg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add selected media' }));
  await waitFor(() =>
    expect(
      requests.some(
        ({ url, method, body }) =>
          url.pathname === '/api/albums/a/media' &&
          method === 'POST' &&
          JSON.parse(body).mediaId === 'new',
      ),
    ).toBe(true),
  );
});
it('shows a recoverable album error and does not request its gallery', async () => {
  serve(() => respond({ error: 'NOT_FOUND', message: 'Album not found' }, 404));
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Album not found');
  expect(requests).toHaveLength(1);
});

it('starts fresh selection on an album route change', async () => {
  serve((url) =>
    url.pathname === '/api/albums/b'
      ? respond({ ...album, id: 'b', name: 'Other' })
      : defaultResponse(url),
  );
  setup();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select one.jpg' }));
  expect(screen.getByText('1 selected')).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'Other album' }));
  await screen.findByRole('heading', { name: 'Other' });
  expect(screen.getByText('0 selected')).toBeVisible();
  expect(await screen.findByRole('checkbox', { name: 'Select one.jpg' })).not.toBeChecked();
});

it('refreshes inactive favorite filters after favoriting in the all-media view', async () => {
  let favorite = false;
  serve((url, options) => {
    if (options.method === 'POST') {
      favorite = true;
      return respond(null, 204);
    }
    if (url.pathname === '/api/albums/a') return respond(album);
    const items = [media('one'), media('two')].filter(
      (item) => !(item.id === 'one' && favorite && url.searchParams.get('favorite') === 'false'),
    );
    return respond({ items, hasMore: false, nextCursor: null });
  });
  setup('/albums/a?favorite=false');
  await screen.findByRole('button', { name: 'Open one.jpg' });
  fireEvent.change(screen.getByLabelText('Favorite'), { target: { value: '' } });
  await screen.findByRole('button', { name: 'Open one.jpg' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select one.jpg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Favorite selected' }));
  await waitFor(() => expect(screen.getByText('0 selected')).toBeVisible());
  fireEvent.change(screen.getByLabelText('Favorite'), { target: { value: 'false' } });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Open one.jpg' })).not.toBeInTheDocument(),
  );
});

it('locks picker card selection during additions and preserves a failed item', async () => {
  let resolve;
  serve((url, options) =>
    options.method === 'POST'
      ? new Promise((done) => {
          resolve = done;
        })
      : url.pathname === '/api/media'
        ? respond({ items: [media('new')], hasMore: false, nextCursor: null })
        : defaultResponse(url),
  );
  setup();
  await screen.findByRole('button', { name: 'Open one.jpg' });
  fireEvent.click(screen.getByRole('button', { name: 'Add media' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select new.jpg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add selected media' }));
  await waitFor(() =>
    expect(screen.getByRole('checkbox', { name: 'Select new.jpg' })).toBeDisabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open new.jpg' }));
  expect(screen.getByRole('checkbox', { name: 'Select new.jpg' })).toBeChecked();
  resolve(respond({ error: 'UNAVAILABLE', message: 'Add unavailable' }, 503));
  await screen.findByRole('alert');
  expect(screen.getByText('1 to add')).toBeVisible();
});

it('keeps loaded media after a cursor failure and retries the same opaque cursor', async () => {
  let fail = true;
  serve((url) => {
    if (url.pathname === '/api/albums/a') return respond(album);
    if (!url.searchParams.has('cursor'))
      return respond({ items: [media('one')], hasMore: true, nextCursor: 'opaque+/=' });
    return fail
      ? respond({ error: 'UNAVAILABLE', message: 'Gallery unavailable' }, 503)
      : respond({ items: [media('two')], hasMore: false, nextCursor: null });
  });
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Gallery unavailable');
  expect(screen.getByRole('button', { name: 'Open one.jpg' })).toBeVisible();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Open two.jpg' });
  expect(
    requests
      .filter(({ url }) => url.searchParams.has('cursor'))
      .map(({ url }) => url.searchParams.get('cursor')),
  ).toEqual(['opaque+/=', 'opaque+/=']);
});

it('requires confirmation before removing selected album memberships', async () => {
  serve(defaultResponse);
  setup();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select one.jpg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected from album' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove 1 selected media');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  expect(screen.getByText('1 selected')).toBeVisible();
});
