import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { settingsQueryKeys } from '@/features/settings/index.js';
import { createQueryClient } from '@/services/queryClient.js';

import { StorageSettingsPage } from './StorageSettingsPage.jsx';

const statistics = {
  providerType: 's3',
  bucketName: 'photos',
  endpointHost: 'assets.example',
  objectCount: 1200,
  originalBytes: '2048',
  optimizedBytes: '512',
  variantBytes: '1024',
  totalBytes: '3072',
  estimatedSavedBytes: '1536',
};
const clients = [];
const respond = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function setup() {
  const client = createQueryClient();
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <StorageSettingsPage />
    </QueryClientProvider>,
  );
  return client;
}
function metric(label) {
  return within(screen.getByText(label).parentElement).getByRole('definition');
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});
it('loads storage usage through the settings feature and excludes credentials from UI and cache', async () => {
  vi.stubGlobal('fetch', async (url) => {
    expect(url).toBe('/api/settings/storage');
    return respond({
      ...statistics,
      secretAccessKey: 'private-secret',
      accessKeyId: 'private-access',
      signedUrl: 'https://private/?signature=sensitive',
    });
  });
  const client = setup();
  expect(screen.getByRole('status')).toHaveTextContent('Loading storage settings');
  await screen.findByRole('heading', { name: 'Storage usage' });
  expect(metric('Provider')).toHaveTextContent('s3');
  expect(metric('Bucket')).toHaveTextContent('photos');
  expect(metric('Total storage usage')).toHaveTextContent('3 KiB');
  expect(metric('Original size')).toHaveTextContent('2 KiB');
  expect(metric('Optimized size')).toHaveTextContent('512 B');
  expect(metric('Estimated savings')).toHaveTextContent('1.5 KiB');
  expect(metric('Objects')).toHaveTextContent('1,200');
  expect(screen.getByText(/Includes files in trash/)).toBeVisible();
  expect(screen.getByText(/Originals remain stored/)).toBeVisible();
  expect(document.body.textContent).not.toMatch(/private-secret|private-access|signature=/);
  expect(client.getQueryData(settingsQueryKeys.storage())).toEqual(statistics);
});
it('renders empty storage as zero and omits unavailable counts', async () => {
  vi.stubGlobal('fetch', async () =>
    respond({
      providerType: null,
      bucketName: null,
      objectCount: null,
      originalBytes: '0',
      optimizedBytes: '0',
      variantBytes: '0',
      totalBytes: '0',
      estimatedSavedBytes: '0',
    }),
  );
  setup();
  await screen.findByRole('heading', { name: 'Storage usage' });
  expect(metric('Total storage usage')).toHaveTextContent('0 B');
  expect(metric('Provider')).toHaveTextContent('Unavailable');
  expect(metric('Bucket')).toHaveTextContent('Unavailable');
  expect(screen.queryByText('Objects')).not.toBeInTheDocument();
});
it('preserves exact byte counts above Number precision in metric titles', async () => {
  vi.stubGlobal('fetch', async () =>
    respond({ ...statistics, originalBytes: '9007199254740993', totalBytes: '9007199254742017' }),
  );
  setup();
  await screen.findByRole('heading', { name: 'Storage usage' });
  expect(metric('Original size')).toHaveAttribute('title', '9007199254740993 bytes');
  expect(metric('Total storage usage')).toHaveTextContent('8 PiB');
});
it('offers retry after a load failure', async () => {
  let failed = true;
  vi.stubGlobal('fetch', async () =>
    failed
      ? respond({ error: 'INTERNAL_ERROR', message: 'Unavailable' }, 503)
      : respond(statistics),
  );
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load storage settings');
  expect(screen.queryByRole('heading', { name: 'Storage usage' })).not.toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Storage usage' });
});
it('retains previous totals after failed refresh and updates them on retry', async () => {
  let failed = false;
  let data = statistics;
  vi.stubGlobal('fetch', async () =>
    failed ? respond({ error: 'INTERNAL_ERROR', message: 'Unavailable' }, 503) : respond(data),
  );
  setup();
  await screen.findByRole('heading', { name: 'Storage usage' });
  failed = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh storage' }));
  await screen.findByRole('alert');
  expect(metric('Total storage usage')).toHaveTextContent('3 KiB');
  failed = false;
  data = { ...statistics, totalBytes: '4096' };
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(metric('Total storage usage')).toHaveTextContent('4 KiB'));
});
