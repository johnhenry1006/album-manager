import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { UploadPage } from './UploadPage.jsx';

let client;
let files;
let calls;
let ready;
let duplicate;
let storageFailures;
let categoryFailures;
let unavailableCategories;
let holdStorage;
let paginatedOptions;
const photo = (name) => new File(['photo'], name, { type: 'image/jpeg' });
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function selectFiles(...selected) {
  fireEvent.change(screen.getByLabelText('Files'), { target: { files: selected } });
}
function row(name) {
  return screen.getByRole('listitem', { name });
}
async function selectOptions() {
  await screen.findByRole('option', { name: 'Holiday' });
  fireEvent.change(screen.getByLabelText('Album'), { target: { value: 'a1' } });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Nature' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Summer' }));
}
beforeEach(() => {
  client = createQueryClient();
  files = new Map();
  calls = [];
  ready = false;
  duplicate = false;
  storageFailures = 0;
  categoryFailures = 0;
  unavailableCategories = false;
  holdStorage = false;
  paginatedOptions = false;
  let sessions = 0;
  vi.stubGlobal('XMLHttpRequest', undefined);
  vi.stubGlobal('fetch', async (url, options) => {
    if (url.startsWith('https://storage.example/')) {
      calls.push({ path: url, method: options.method, body: options.body });
      if (holdStorage)
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          }),
        );
      if (storageFailures-- > 0) throw new TypeError('Storage unavailable');
      return new Response(null, { status: 204 });
    }
    const parsed = new URL(url, 'http://localhost');
    const path = parsed.pathname;
    const body = options.body && JSON.parse(options.body);
    calls.push({ path, method: options.method, body });
    if (
      options.method === 'GET' &&
      ['/api/albums', '/api/categories', '/api/tags'].includes(path)
    ) {
      if (path === '/api/categories' && unavailableCategories)
        return json({ error: 'UNAVAILABLE', message: 'Categories unavailable' }, 503);
      let items =
        path === '/api/albums'
          ? [
              { id: 'a1', name: 'Holiday' },
              { id: 'a2', name: 'Work' },
            ]
          : path === '/api/categories'
            ? [{ id: 'c1', name: 'Nature' }]
            : [{ id: 't1', name: 'Summer' }];
      const page = Number(parsed.searchParams.get('page') ?? 1);
      if (paginatedOptions && page === 2)
        items =
          path === '/api/categories'
            ? [{ id: 'c2', name: 'City' }]
            : path === '/api/tags'
              ? [{ id: 't2', name: 'Winter' }]
              : [{ id: 'a2', name: 'Work' }];
      return json({
        items,
        pagination: { page, totalPages: paginatedOptions ? 2 : 1, total: items.length },
      });
    }
    if (/\/api\/(albums\/[^/]+\/media|media\/[^/]+\/(categories|tags))$/.test(path)) {
      if (path.endsWith('/categories') && categoryFailures-- > 0)
        return json({ error: 'UNAVAILABLE', message: 'Assignment unavailable' }, 503);
      return json({ success: true });
    }
    if (path === '/api/uploads/sessions' && options.method === 'POST')
      return json({ sessionId: `s${++sessions}`, status: 'REGISTERED' }, 201);
    const sessionId = path.match(/\/sessions\/([^/]+)/)?.[1];
    if (path.endsWith('/files') && sessionId) {
      const id = `f${files.size + 1}`;
      const registered = {
        ...body,
        fileSize: String(body.fileSize),
        sessionId,
        uploadFileId: id,
        status: 'REGISTERED',
        mediaId: null,
      };
      files.set(id, registered);
      return json(registered, 201);
    }
    const uploadFileId = path.match(/\/files\/([^/]+)/)?.[1];
    const file = files.get(uploadFileId);
    if (path.endsWith('/presign')) {
      file.status = 'UPLOADING';
      return json({
        uploadFileId,
        url: `https://storage.example/${uploadFileId}`,
        method: 'PUT',
        headers: { 'Content-Type': file.mimeType },
      });
    }
    if (path.endsWith('/complete')) {
      file.status = duplicate ? 'DUPLICATE_PENDING' : 'PROCESSING';
      file.mediaId = `temporary-${uploadFileId}`;
      return json(file, 202);
    }
    if (path.endsWith('/duplicate/resolve')) {
      file.status =
        body.action === 'SKIP'
          ? 'CANCELLED'
          : body.action === 'USE_EXISTING'
            ? 'READY'
            : 'PROCESSING';
      file.mediaId =
        body.action === 'SKIP' ? null : body.action === 'USE_EXISTING' ? 'existing' : file.mediaId;
      return json({
        uploadFileId,
        status: file.status,
        finalMediaId: file.status === 'READY' ? file.mediaId : null,
      });
    }
    if (sessionId && options.method === 'GET') {
      const items = [...files.values()]
        .filter((item) => item.sessionId === sessionId)
        .map((item) => {
          if (ready && item.status === 'PROCESSING') {
            item.status = 'READY';
            item.mediaId = `final-${item.uploadFileId}`;
          }
          return { ...item };
        });
      return json({
        sessionId,
        status: items[0]?.status ?? 'REGISTERED',
        files: items,
        nextCursor: null,
      });
    }
    throw new Error(`Unexpected request ${options.method} ${path}`);
  });
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

it('drops multiple files, shows processing, and assigns only final media identities', async () => {
  mount();
  await selectOptions();
  fireEvent.drop(screen.getByRole('region', { name: 'Upload files' }), {
    dataTransfer: { files: [photo('one.jpg'), photo('two.jpg')], types: ['Files'] },
  });
  expect(screen.getByLabelText('Files')).toHaveAttribute('multiple');
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await waitFor(() => expect(screen.getAllByText('Processing media…')).toHaveLength(2));
  expect(calls.filter(({ path }) => path.startsWith('/api/media/'))).toHaveLength(0);
  ready = true;
  await waitFor(() => expect(screen.getAllByText('Completed')).toHaveLength(2), { timeout: 3000 });
  for (const id of ['f1', 'f2']) {
    expect(calls).toContainEqual({
      path: '/api/albums/a1/media',
      method: 'POST',
      body: { mediaId: `final-${id}` },
    });
    expect(calls).toContainEqual({
      path: `/api/media/final-${id}/categories`,
      method: 'POST',
      body: { categoryIds: ['c1'] },
    });
    expect(calls).toContainEqual({
      path: `/api/media/final-${id}/tags`,
      method: 'POST',
      body: { tagIds: ['t1'] },
    });
  }
});

it('rejects invalid files independently while allowing valid files to upload', async () => {
  mount();
  selectFiles(new File(['bad'], 'bad.txt', { type: 'text/plain' }), photo('valid.jpg'));
  expect(within(row('bad.txt')).getByRole('alert')).toHaveTextContent('not supported');
  ready = true;
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await within(row('valid.jpg')).findByText('Completed', {}, { timeout: 3000 });
  expect(files.size).toBe(1);
});

it.each(['SKIP', 'USE_EXISTING', 'KEEP_BOTH'])(
  'shows and resolves duplicate action %s',
  async (action) => {
    duplicate = true;
    mount();
    await selectOptions();
    selectFiles(photo('duplicate.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
    const labels = { SKIP: 'Skip', USE_EXISTING: 'Use existing', KEEP_BOTH: 'Keep both' };
    fireEvent.click(
      await within(row('duplicate.jpg')).findByRole('button', { name: labels[action] }),
    );
    if (action === 'KEEP_BOTH') ready = true;
    await within(row('duplicate.jpg')).findByText(
      action === 'SKIP' ? 'Skipped' : 'Completed',
      {},
      { timeout: 3000 },
    );
    const assignments = calls.filter(({ path }) => path === '/api/albums/a1/media');
    expect(assignments).toHaveLength(action === 'SKIP' ? 0 : 1);
    if (action !== 'SKIP')
      expect(assignments[0].body.mediaId).toBe(action === 'USE_EXISTING' ? 'existing' : 'final-f1');
  },
);

it('retries a failed storage transfer without registering another file', async () => {
  storageFailures = 1;
  ready = true;
  mount();
  selectFiles(photo('retry.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  fireEvent.click(await within(row('retry.jpg')).findByRole('button', { name: 'Retry' }));
  await within(row('retry.jpg')).findByText('Completed', {}, { timeout: 3000 });
  expect(files.size).toBe(1);
  expect(calls.filter(({ path }) => path === 'https://storage.example/f1')).toHaveLength(2);
});

it('retries failed assignment without uploading again or repeating album assignment', async () => {
  categoryFailures = 1;
  ready = true;
  mount();
  await selectOptions();
  selectFiles(photo('assignment.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await within(row('assignment.jpg')).findByRole('button', { name: 'Retry' }, { timeout: 3000 });
  fireEvent.change(screen.getByLabelText('Album'), { target: { value: 'a2' } });
  fireEvent.click(within(row('assignment.jpg')).getByRole('button', { name: 'Retry' }));
  await within(row('assignment.jpg')).findByText('Completed');
  expect(calls.filter(({ path }) => path === 'https://storage.example/f1')).toHaveLength(1);
  expect(calls.filter(({ path }) => path === '/api/albums/a1/media')).toHaveLength(1);
  expect(calls.filter(({ path }) => path === '/api/albums/a2/media')).toHaveLength(0);
  expect(
    calls.filter(({ path }) => path.endsWith('/tags') && path.startsWith('/api/media/')),
  ).toHaveLength(1);
});

it('cancels active transfers and keeps queued cancellation from creating remote state', async () => {
  holdStorage = true;
  mount();
  selectFiles(photo('cancel.jpg'), photo('queued.jpg'));
  fireEvent.click(within(row('queued.jpg')).getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await waitFor(() =>
    expect(calls.some(({ path }) => path.startsWith('https://storage.example/'))).toBe(true),
  );
  fireEvent.click(within(row('cancel.jpg')).getByRole('button', { name: 'Cancel' }));
  await within(row('cancel.jpg')).findByText('Cancelled');
  expect(files.size).toBe(1);
  expect(calls.some(({ path }) => path.endsWith('/complete'))).toBe(false);
});

it('allows upload when optional categories are unavailable', async () => {
  unavailableCategories = true;
  ready = true;
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Categories unavailable');
  selectFiles(photo('no-category.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await within(row('no-category.jpg')).findByText('Completed', {}, { timeout: 3000 });
});

it('preserves categories selected on different option pages', async () => {
  paginatedOptions = true;
  ready = true;
  mount();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Nature' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next categories' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'City' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous categories' }));
  expect(await screen.findByRole('checkbox', { name: 'Nature' })).toBeChecked();
  selectFiles(photo('pages.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await within(row('pages.jpg')).findByText('Completed', {}, { timeout: 3000 });
  expect(calls).toContainEqual({
    path: '/api/media/final-f1/categories',
    method: 'POST',
    body: { categoryIds: ['c1', 'c2'] },
  });
});

it('limits concurrent lifecycles and starts the next file when one slot completes', async () => {
  mount();
  selectFiles(photo('one.jpg'), photo('two.jpg'), photo('three.jpg'), photo('four.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await waitFor(() => expect(screen.getAllByText('Processing media…')).toHaveLength(3));
  expect(files.size).toBe(3);
  expect(within(row('four.jpg')).getByText('Waiting to upload')).toBeInTheDocument();
  const first = files.get('f1');
  first.status = 'READY';
  first.mediaId = 'final-f1';
  await within(row('one.jpg')).findByText('Completed', {}, { timeout: 3000 });
  await waitFor(() => expect(files.size).toBe(4));
  ready = true;
  await waitFor(() => expect(screen.getAllByText('Completed')).toHaveLength(4), { timeout: 3000 });
});

it('cancels one processing file without cancelling another and clears finished entries', async () => {
  mount();
  selectFiles(photo('cancelled.jpg'), photo('success.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await waitFor(() => expect(screen.getAllByText('Processing media…')).toHaveLength(2));
  fireEvent.click(within(row('cancelled.jpg')).getByRole('button', { name: 'Cancel' }));
  await within(row('cancelled.jpg')).findByText('Cancelled');
  ready = true;
  await within(row('success.jpg')).findByText('Completed', {}, { timeout: 3000 });
  fireEvent.click(screen.getByRole('button', { name: 'Clear finished' }));
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});

it('stops further assignment when cancelled during an in-flight album mutation', async () => {
  ready = true;
  const previousFetch = globalThis.fetch;
  let finishAlbum;
  let albumAttempts = 0;
  vi.stubGlobal('fetch', (url, options) => {
    if (url.endsWith('/albums/a1/media')) {
      albumAttempts += 1;
      return new Promise((resolve) => {
        finishAlbum = () => resolve(json({ success: true }));
      });
    }
    return previousFetch(url, options);
  });
  mount();
  await selectOptions();
  selectFiles(photo('assign-cancel.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await waitFor(() => expect(finishAlbum).toBeTypeOf('function'), { timeout: 3000 });
  fireEvent.click(within(row('assign-cancel.jpg')).getByRole('button', { name: 'Cancel' }));
  finishAlbum();
  await within(row('assign-cancel.jpg')).findByText('Cancelled');
  expect(
    calls.some(({ path }) => path.startsWith('/api/media/') && path.endsWith('/categories')),
  ).toBe(false);
  fireEvent.click(within(row('assign-cancel.jpg')).getByRole('button', { name: 'Retry' }));
  await within(row('assign-cancel.jpg')).findByText('Completed');
  expect(albumAttempts).toBe(1);
  expect(calls.filter(({ path }) => path.startsWith('https://storage.example/'))).toHaveLength(1);
});

it('cancels and retries a waiting fourth entry without registering it prematurely', async () => {
  mount();
  selectFiles(photo('first.jpg'), photo('second.jpg'), photo('third.jpg'), photo('waiting.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await waitFor(() => expect(screen.getAllByText('Processing media…')).toHaveLength(3));
  fireEvent.click(within(row('waiting.jpg')).getByRole('button', { name: 'Cancel' }));
  expect(within(row('waiting.jpg')).getByText('Cancelled')).toBeInTheDocument();
  expect(files.size).toBe(3);
  fireEvent.click(within(row('waiting.jpg')).getByRole('button', { name: 'Retry' }));
  expect(within(row('waiting.jpg')).getByText('Waiting to upload')).toBeInTheDocument();
  expect(files.size).toBe(3);
  ready = true;
  await waitFor(() => expect(screen.getAllByText('Completed')).toHaveLength(4), { timeout: 4000 });
  expect(files.size).toBe(4);
});

it('renders browser byte progress for a queue entry', async () => {
  let xhr;
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      upload = {};
      open() {
        xhr = this;
      }
      setRequestHeader() {}
      send() {}
      abort() {
        this.onabort?.();
      }
    },
  );
  mount();
  selectFiles(photo('progress.jpg'));
  fireEvent.click(screen.getByRole('button', { name: 'Upload queued files' }));
  await waitFor(() => expect(xhr).toBeDefined());
  // Storage events are browser input; the feature and queue remain real.
  act(() => xhr.upload.onprogress({ lengthComputable: true, loaded: 2, total: 5 }));
  expect(within(row('progress.jpg')).getByRole('progressbar')).toHaveAttribute('value', '40');
  fireEvent.click(within(row('progress.jpg')).getByRole('button', { name: 'Cancel' }));
  await within(row('progress.jpg')).findByText('Cancelled');
});
