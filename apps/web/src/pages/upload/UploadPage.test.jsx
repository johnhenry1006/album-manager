import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { UploadPage } from './UploadPage.jsx';

afterEach(() => vi.unstubAllGlobals());

it('shows processing until media is READY and then links the final media', async () => {
  let ready = false;
  const client = createQueryClient();
  client.setQueryData(['media', 'lists', 'media', {}], { items: [] });
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  vi.stubGlobal('XMLHttpRequest', undefined);
  vi.stubGlobal('fetch', async (url, options) => {
    if (url === 'https://storage.example/signed') return new Response(null, { status: 204 });
    const payload = url.endsWith('/presign')
      ? {
          url: 'https://storage.example/signed',
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
        }
      : url.endsWith('/complete')
        ? { uploadFileId: 'f', status: 'PROCESSING', mediaId: 'temporary' }
        : url.endsWith('/files')
          ? { uploadFileId: 'f', sessionId: 's', status: 'REGISTERED' }
          : options.method === 'GET'
            ? {
                sessionId: 's',
                status: ready ? 'READY' : 'PROCESSING',
                files: [
                  {
                    uploadFileId: 'f',
                    status: ready ? 'READY' : 'PROCESSING',
                    mediaId: ready ? 'final' : 'temporary',
                  },
                ],
                nextCursor: null,
              }
            : { sessionId: 's', status: 'REGISTERED' };
    return new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  try {
    fireEvent.change(screen.getByLabelText('File'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload file' }));
    await screen.findByText('Processing media…');
    expect(screen.queryByRole('link', { name: 'View media' })).not.toBeInTheDocument();
    ready = true;
    expect(
      await screen.findByRole('link', { name: 'View media' }, { timeout: 2000 }),
    ).toHaveAttribute('href', '/media/final');
    expect(client.getQueryState(['media', 'lists', 'media', {}]).isInvalidated).toBe(true);
  } finally {
    view.unmount();
    client.clear();
  }
});

it('does not retry a previous file after selecting a different file', async () => {
  const client = createQueryClient();
  const first = new File(['a'], 'first.jpg', { type: 'image/jpeg' });
  const second = new File(['b'], 'second.jpg', { type: 'image/jpeg' });
  vi.stubGlobal('XMLHttpRequest', undefined);
  vi.stubGlobal('fetch', async (url) => {
    if (url === 'https://storage.example/signed') throw new TypeError('Storage is unavailable');
    const payload = url.endsWith('/presign')
      ? {
          url: 'https://storage.example/signed',
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
        }
      : url.endsWith('/files')
        ? { uploadFileId: 'f', sessionId: 's', status: 'REGISTERED' }
        : { sessionId: 's', status: 'REGISTERED', files: [], nextCursor: null };
    return new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  try {
    fireEvent.change(screen.getByLabelText('File'), { target: { files: [first] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload file' }));
    await screen.findByRole('button', { name: 'Retry' });
    fireEvent.change(screen.getByLabelText('File'), { target: { files: [second] } });
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload file' })).toBeEnabled();
  } finally {
    view.unmount();
    client.clear();
  }
});
