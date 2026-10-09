import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { MediaDetailPage } from './MediaDetailPage.jsx';

const clients = [];
const requests = [];
const detail = {
  id: 'photo',
  type: 'IMAGE',
  originalFilename: 'Beach.jpg',
  mimeType: 'image/jpeg',
  extension: 'jpg',
  fileSize: '2048',
  width: 800,
  height: 600,
  aspectRatio: 4 / 3,
  status: 'READY',
  favorite: false,
  takenAt: '2026-01-01T12:00:00.000Z',
  createdAt: '2026-01-02T12:00:00.000Z',
  updatedAt: '2026-01-03T12:00:00.000Z',
  albums: [{ id: 'album', name: 'Holiday' }],
  categories: [{ id: 'category', name: 'Travel' }],
  tags: [{ id: 'tag', name: 'Beach' }],
  metadata: {
    cameraMake: 'Canon',
    cameraModel: 'EOS',
    iso: 100,
    latitude: 0,
    rawMetadata: { exposure: 'auto' },
  },
  variants: [
    { type: 'THUMBNAIL', url: '/thumbnail.webp', width: 200, height: 150 },
    { type: 'PREVIEW', url: '/preview.webp', width: 800, height: 600 },
    { type: 'ORIGINAL', url: '/never-auto-load.jpg' },
  ],
};
function respond(payload, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function serve(handler = () => respond(detail)) {
  vi.stubGlobal('fetch', async (url, options) => {
    requests.push({ url, method: options.method });
    return handler(url, options);
  });
}
function NextMedia() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/media/other')}>Next media</button>;
}
function setup() {
  const client = createQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/media/photo']}>
        <NextMedia />
        <Routes>
          <Route path="/media/:mediaId" element={<MediaDetailPage />} />
          <Route path="/media" element={<h1>Media library</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  requests.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('shows the preview, metadata and memberships without requesting originals', async () => {
  serve();
  const { container } = setup();
  expect(await screen.findByRole('img', { name: 'Beach.jpg' })).toHaveAttribute(
    'src',
    '/preview.webp',
  );
  expect(screen.getByRole('link', { name: 'Holiday' })).toHaveAttribute('href', '/albums/album');
  expect(screen.getByRole('link', { name: 'Travel' })).toHaveAttribute(
    'href',
    '/media?category=category',
  );
  expect(screen.getByRole('link', { name: 'Beach' })).toHaveAttribute('href', '/media?tag=tag');
  expect(screen.getByText('Canon')).toBeVisible();
  expect(screen.getByText('0')).toBeVisible();
  expect(container.querySelector('[src="/never-auto-load.jpg"]')).toBeNull();
  expect(requests).toEqual([{ url: '/api/media/photo', method: 'GET' }]);
});

it('plays a video variant with poster and typed metadata through the existing detail page', async () => {
  let refreshed = false;
  serve(() =>
    respond({
      ...detail,
      type: 'VIDEO',
      metadata: {
        duration: 12.5,
        videoCodec: 'h264',
        audioCodec: 'aac',
        frameRate: 30,
        bitrate: 1250000,
      },
      variants: [
        { type: 'PREVIEW', format: 'webp', url: '/poster.webp' },
        {
          type: 'OPTIMIZED',
          name: 'playback',
          format: 'mp4',
          url: refreshed ? '/refreshed-playback.mp4' : '/playback.mp4',
        },
      ],
    }),
  );
  const { container } = setup();
  await screen.findByText('h264');
  const video = container.querySelector('video');
  expect(video).toHaveAttribute('src', '/playback.mp4');
  expect(video).toHaveAttribute('poster', '/poster.webp');
  expect(video).toHaveAttribute('preload', 'none');
  expect(video).toHaveAttribute('controls');
  expect(screen.getByText('12.5 seconds')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Holiday' })).toBeVisible();
  expect(requests.some(({ url }) => url.endsWith('/original-url'))).toBe(false);
  fireEvent.error(video);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load video');
  refreshed = true;
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
  await waitFor(() =>
    expect(container.querySelector('video')).toHaveAttribute('src', '/refreshed-playback.mp4'),
  );
});

it('never renders a video playback variant as an image when its poster is missing', async () => {
  serve(() =>
    respond({
      ...detail,
      type: 'VIDEO',
      variants: [{ type: 'OPTIMIZED', format: 'mp4', name: 'playback', url: '/playback.mp4' }],
    }),
  );
  const { container } = setup();
  await screen.findByText('VIDEO');
  expect(container.querySelector('video')).toHaveAttribute('src', '/playback.mp4');
  expect(container.querySelector('img')).toBeNull();
});

it('requests an original link only after an explicit action and resets it for another media', async () => {
  serve((url) =>
    url.endsWith('/original-url')
      ? respond({ url: 'https://assets.example/original.jpg', expiresAt: '2099-01-01T00:00:00Z' })
      : respond({ ...detail, id: url.endsWith('/other') ? 'other' : 'photo' }),
  );
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Open original' }));
  expect(await screen.findByRole('link', { name: 'View original' })).toHaveAttribute(
    'href',
    'https://assets.example/original.jpg',
  );
  expect(requests.filter(({ url }) => url.endsWith('/original-url'))).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Next media' }));
  await waitFor(() => expect(requests.some(({ url }) => url === '/api/media/other')).toBe(true));
  expect(screen.queryByRole('link', { name: 'View original' })).not.toBeInTheDocument();
  expect(requests.some(({ url }) => url === '/api/media/other/original-url')).toBe(false);
});

it('uses an optimized variant when no preview exists and never falls back to originals', async () => {
  serve(() =>
    respond({
      ...detail,
      variants: [
        { type: 'OPTIMIZED', url: '/optimized.webp' },
        { type: 'ORIGINAL', url: '/never.jpg' },
      ],
    }),
  );
  setup();
  expect(await screen.findByRole('img', { name: 'Beach.jpg' })).toHaveAttribute(
    'src',
    '/optimized.webp',
  );
});

it('shows missing preview and metadata without loading an original', async () => {
  serve(() =>
    respond({
      ...detail,
      variants: [
        { type: 'THUMBNAIL', url: '/thumbnail.webp' },
        { type: 'ORIGINAL', url: '/never.jpg' },
      ],
      metadata: null,
      albums: [],
      categories: [],
      tags: [],
    }),
  );
  setup();
  expect(await screen.findByText('No preview available')).toBeVisible();
  expect(screen.getByText('No albums')).toBeVisible();
  expect(screen.getByText('No categories')).toBeVisible();
  expect(screen.getByText('No tags')).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('toggles favorites through explicit add/remove actions and refreshes detail', async () => {
  let favorite = false;
  serve((url, { method }) => {
    if (url.endsWith('/favorite')) {
      favorite = method === 'POST';
      return respond(null, 204);
    }
    return respond({ ...detail, favorite });
  });
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Add to favorites' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove from favorites' }));
  await screen.findByRole('button', { name: 'Add to favorites' });
  expect(
    requests.filter(({ url }) => url.endsWith('/favorite')).map(({ method }) => method),
  ).toEqual(['POST', 'DELETE']);
});

it('keeps failed favorite and trash actions recoverable without navigating away', async () => {
  serve((_url, { method }) =>
    method !== 'GET'
      ? respond({ error: 'UNAVAILABLE', message: 'Action unavailable' }, 503)
      : respond(detail),
  );
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Add to favorites' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Action unavailable');
  expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm move to trash' }));
  await waitFor(() =>
    expect(
      requests.some(({ url, method }) => url === '/api/media/photo' && method === 'DELETE'),
    ).toBe(true),
  );
  expect(screen.queryByRole('heading', { name: 'Media library' })).not.toBeInTheDocument();
});

it('returns to the library only after trash succeeds', async () => {
  serve((_url, { method }) => (method === 'DELETE' ? respond(null, 204) : respond(detail)));
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm move to trash' }));
  expect(await screen.findByRole('heading', { name: 'Media library' })).toBeVisible();
});

it('shows loading and retries a detail failure', async () => {
  let resolve;
  serve(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  setup();
  expect(screen.getByText('Loading media details')).toBeVisible();
  resolve(respond({ error: 'NOT_FOUND', message: 'Media not found' }, 404));
  expect(await screen.findByRole('alert')).toHaveTextContent('Media not found');
  serve();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('img', { name: 'Beach.jpg' })).toBeVisible();
});

it('surfaces original-link errors and allows explicit retry', async () => {
  let fail = true;
  serve((url) =>
    !url.endsWith('/original-url')
      ? respond(detail)
      : fail
        ? respond({ error: 'UNAVAILABLE', message: 'Original unavailable' }, 503)
        : respond({ url: 'https://assets.example/original.jpg' }),
  );
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Open original' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Original unavailable');
  fail = false;
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: 'View original' })).toBeVisible();
});

it('disables conflicting actions during a favorite request and ignores repeat clicks', async () => {
  let resolve;
  serve((url) =>
    url.endsWith('/favorite')
      ? new Promise((done) => {
          resolve = done;
        })
      : respond(detail),
  );
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Add to favorites' }));
  const pending = await screen.findByRole('button', { name: 'Updating favorite…' });
  expect(pending).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Move to trash' })).toBeDisabled();
  fireEvent.click(pending);
  expect(requests.filter(({ url }) => url.endsWith('/favorite'))).toHaveLength(1);
  resolve(respond(null, 204));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeEnabled(),
  );
});

it('does not redirect a different media page when an earlier trash request finishes', async () => {
  let resolve;
  serve((_url, { method }) =>
    method === 'DELETE'
      ? new Promise((done) => {
          resolve = done;
        })
      : respond(detail),
  );
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm move to trash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next media' }));
  await waitFor(() => expect(requests.some(({ url }) => url === '/api/media/other')).toBe(true));
  resolve(respond(null, 204));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Move to trash' })).toBeEnabled());
  expect(screen.queryByRole('heading', { name: 'Media library' })).not.toBeInTheDocument();
});

it('shows preview loading and an image error without fetching original media', async () => {
  serve();
  setup();
  const image = await screen.findByRole('img', { name: 'Beach.jpg' });
  expect(screen.getByText('Loading preview')).toBeVisible();
  fireEvent.error(image);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load preview');
  expect(requests.some(({ url }) => url.endsWith('/original-url'))).toBe(false);
});

it('allows original signing for another media while an earlier original request is pending', async () => {
  let resolve;
  serve((url) => {
    if (url === '/api/media/photo/original-url')
      return new Promise((done) => {
        resolve = done;
      });
    if (url === '/api/media/other/original-url')
      return respond({ url: 'https://assets.example/other.jpg' });
    return respond({ ...detail, id: url.endsWith('/other') ? 'other' : 'photo' });
  });
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Open original' }));
  expect(await screen.findByRole('button', { name: 'Preparing original…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next media' }));
  const openOther = await screen.findByRole('button', { name: 'Open original' });
  expect(openOther).toBeEnabled();
  fireEvent.click(openOther);
  expect(await screen.findByRole('link', { name: 'View original' })).toHaveAttribute(
    'href',
    'https://assets.example/other.jpg',
  );
  await act(async () => resolve(respond({ url: 'https://assets.example/photo.jpg' })));
  expect(screen.getByRole('link', { name: 'View original' })).toHaveAttribute(
    'href',
    'https://assets.example/other.jpg',
  );
});

it('requires confirmation before moving media to trash and renders filenames as text', async () => {
  serve(() => respond({ ...detail, originalFilename: '<img src=x onerror=alert(1)>.jpg' }));
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('<img src=x onerror=alert(1)>.jpg');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  expect(document.querySelector('img[onerror]')).toBeNull();
});

it('retains a failed trash confirmation and disables both actions during retry', async () => {
  let resolve;
  let failed = false;
  serve((_url, { method }) => {
    if (method !== 'DELETE') return respond(detail);
    if (!failed) {
      failed = true;
      return respond({ error: 'UNAVAILABLE', message: 'Please retry deletion' }, 503);
    }
    return new Promise((done) => {
      resolve = done;
    });
  });
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm move to trash' }));
  const dialog = await screen.findByRole('alertdialog');
  await within(dialog).findByText('Please retry deletion');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm move to trash' }));
  expect(await within(dialog).findByRole('button', { name: 'Moving to trash…' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  resolve(respond(null, 204));
  expect(await screen.findByRole('heading', { name: 'Media library' })).toBeVisible();
});
