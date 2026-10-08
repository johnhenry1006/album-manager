import { afterEach, expect, it, vi } from 'vitest';

import { uploadToStorage } from './uploadTransport.js';

const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
afterEach(() => vi.unstubAllGlobals());

it.each([
  { url: 'not a URL', method: 'PUT' },
  { url: 'file:///tmp/photo', method: 'PUT' },
  { url: 'https://user:password@example.com/upload', method: 'PUT' },
  { url: 'https://example.com/upload', method: 'POST' },
])('rejects invalid presigned instructions with a centralized error: $url', async (presigned) => {
  await expect(uploadToStorage(presigned, file)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});

it('normalizes storage HTTP errors without displaying XML error bodies', async () => {
  vi.stubGlobal('XMLHttpRequest', undefined);
  vi.stubGlobal(
    'fetch',
    async () => new Response('<secret>internal bucket details</secret>', { status: 403 }),
  );
  await expect(
    uploadToStorage({ url: 'https://example.com/upload', method: 'PUT' }, file),
  ).rejects.toMatchObject({
    code: 'UPLOAD_STORAGE_ERROR',
    status: 403,
    message: 'Storage upload failed (403).',
  });
});

it('honors an already cancelled signal before opening storage', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    uploadToStorage({ url: 'https://example.com/upload', method: 'PUT' }, file, {
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
