import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { DashboardPage } from './DashboardPage.jsx';

const summary = {
  counts: { media: 12, albums: 3, categories: 2, tags: 4, processingMedia: 1, failedMedia: 2 },
  storage: { originalBytes: '2048', optimizedBytes: '1024', estimatedSavedBytes: '1024' },
  summaryUpdatedAt: '2026-10-09T00:00:00Z',
  recentAlbums: [
    {
      id: 'album',
      name: 'Trip',
      visibility: 'PRIVATE',
      createdAt: '2026-10-08T12:00:00Z',
      coverMediaId: 'cover',
      coverMedia: {
        id: 'cover',
        thumbnails: [{ width: 200, height: 150, url: '/thumb-cover.webp' }],
      },
    },
  ],
  recentMedia: [
    {
      id: 'photo',
      originalFilename: 'photo.jpg',
      type: 'IMAGE',
      status: 'READY',
      createdAt: '2026-10-08T12:00:00Z',
      width: 800,
      height: 600,
      thumbnails: [{ width: 200, height: 150, url: '/thumb-photo.webp' }],
    },
  ],
};
const clients = [];
function respond(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup(handler) {
  vi.stubGlobal('fetch', handler);
  const client = createQueryClient();
  clients.push(client);
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

it('loads one summary request and displays stats, storage, recent links and supplied thumbnails', async () => {
  const requests = [];
  const { container } = setup(async (url, options) => {
    requests.push(url);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return respond(summary);
  });
  const stats = await screen.findByRole('region', { name: 'Library statistics' });
  expect(within(stats).getByText('12')).toBeVisible();
  expect(within(stats).getByText('Processing')).toBeVisible();
  expect(within(stats).getByText('Failed')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open album Trip' })).toHaveAttribute(
    'href',
    '/albums/album',
  );
  expect(screen.getByRole('link', { name: 'Open media photo.jpg' })).toHaveAttribute(
    'href',
    '/media/photo',
  );
  expect(screen.getByText('2 KiB')).toBeVisible();
  expect(container.querySelector('img[alt="Trip cover"]')).toHaveAttribute(
    'src',
    '/thumb-cover.webp',
  );
  expect(container.querySelector('img[alt="photo.jpg"]')).toHaveAttribute(
    'src',
    '/thumb-photo.webp',
  );
  expect(requests).toEqual(['/api/dashboard']);
});

it('shows loading, then empty recent lists and zero storage without false empty states while pending', async () => {
  let resolve;
  setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard');
  expect(screen.queryByText('No albums yet')).not.toBeInTheDocument();
  resolve(
    respond({
      ...summary,
      counts: { media: 0, albums: 0, categories: 0, tags: 0, processingMedia: 0, failedMedia: 0 },
      storage: { originalBytes: '0', optimizedBytes: '0', estimatedSavedBytes: '0' },
      recentAlbums: [],
      recentMedia: [],
    }),
  );
  expect(await screen.findByText('No albums yet')).toBeVisible();
  expect(screen.getByText('No media yet')).toBeVisible();
  expect(screen.getAllByText('0 B')).toHaveLength(3);
});

it('shows centralized errors and retries the dashboard request', async () => {
  let fail = true;
  setup(async () =>
    fail
      ? respond({ error: 'UNAVAILABLE', message: 'Dashboard unavailable' }, 503)
      : respond(summary),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Dashboard unavailable');
  expect(screen.queryByRole('region', { name: 'Library statistics' })).not.toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('region', { name: 'Library statistics' })).toBeVisible();
});

it('keeps the last summary visible if a refresh fails and prevents duplicate refresh clicks', async () => {
  let resolve;
  let requests = 0;
  setup(async () =>
    ++requests === 1
      ? respond(summary)
      : new Promise((done) => {
          resolve = done;
        }),
  );
  await screen.findByRole('region', { name: 'Library statistics' });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
  expect(await screen.findByRole('button', { name: 'Refreshing…' })).toBeDisabled();
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  resolve(respond({ error: 'UNAVAILABLE', message: 'Refresh unavailable' }, 503));
  expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
  expect(screen.getByRole('region', { name: 'Library statistics' })).toBeVisible();
  expect(requests).toBe(2);
});

it('uses image fallbacks for albums without covers and media still processing', async () => {
  setup(async () =>
    respond({
      ...summary,
      recentAlbums: [{ ...summary.recentAlbums[0], coverMediaId: null, coverMedia: null }],
      recentMedia: [{ ...summary.recentMedia[0], status: 'PROCESSING', thumbnails: [] }],
    }),
  );
  await screen.findByRole('link', { name: 'Open album Trip' });
  expect(screen.getByRole('img', { name: 'Trip cover' })).toHaveTextContent('Image unavailable');
  expect(screen.getByRole('img', { name: 'photo.jpg' })).toHaveTextContent('Image unavailable');
  expect(
    within(screen.getByRole('region', { name: 'Recently uploaded media' })).getByText('Processing'),
  ).toBeVisible();
});
