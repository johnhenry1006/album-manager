import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TagsPage } from '@/pages/tags/TagsPage.jsx';
import { createQueryClient } from '@/services/queryClient.js';

import { CategoriesPage } from './CategoriesPage.jsx';

const clients = [];
const item = (id, name, extra = {}) => ({
  id,
  name,
  slug: id,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...extra,
});
const respond = (body, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function setup(Page) {
  const client = createQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

describe.each([
  { noun: 'category', plural: 'categories', Page: CategoriesPage },
  { noun: 'tag', plural: 'tags', Page: TagsPage },
])('$plural management', ({ noun, plural, Page }) => {
  it('creates, edits, and deletes metadata and displays refreshed results', async () => {
    let items = [];
    vi.stubGlobal('fetch', async (url, options) => {
      expect(new URL(url, 'http://localhost').pathname).toMatch(new RegExp(`^/api/${plural}`));
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        expect(body).toEqual(
          noun === 'category' ? { name: 'Travel', parentId: null } : { name: 'Travel' },
        );
        items = [
          item('travel', body.name, noun === 'category' ? { parentId: null, children: [] } : {}),
        ];
        return respond(items[0], 201);
      }
      if (options.method === 'PATCH') {
        expect(JSON.parse(options.body).name).toBe('Trips');
        items = [{ ...items[0], name: 'Trips' }];
        return respond(items[0]);
      }
      if (options.method === 'DELETE') {
        items = [];
        return respond(null, 204);
      }
      return respond({
        items,
        pagination: { page: 1, limit: 50, total: items.length, totalPages: items.length ? 1 : 0 },
      });
    });
    setup(Page);
    await screen.findByText(`No ${plural} yet.`);
    fireEvent.click(screen.getByRole('button', { name: `Create ${noun}` }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Travel ' } });
    fireEvent.click(screen.getByRole('button', { name: `Save ${noun}` }));
    await screen.findByText('Travel');
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit Travel' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Trips' } });
    fireEvent.click(screen.getByRole('button', { name: `Save ${noun}` }));
    await screen.findByText('Trips');
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Trips' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Trips');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: `Delete ${noun}` }),
    );
    await screen.findByText(`No ${plural} yet.`);
  });

  it('preserves a failed draft and disables mutations while saving', async () => {
    let finish;
    vi.stubGlobal('fetch', async (_url, options) =>
      options.method === 'POST'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : respond({ items: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
    );
    setup(Page);
    await screen.findByText(`No ${plural} yet.`);
    fireEvent.click(screen.getByRole('button', { name: `Create ${noun}` }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Travel' } });
    fireEvent.click(screen.getByRole('button', { name: `Save ${noun}` }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    finish(respond({ error: 'CONFLICT', message: 'Name conflict' }, 409));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name conflict');
    expect(screen.getByLabelText('Name')).toHaveValue('Travel');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows loading and retries a failed list request', async () => {
    let finish;
    let failed = true;
    vi.stubGlobal('fetch', async () =>
      failed
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : respond({ items: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
    );
    setup(Page);
    expect(screen.getByRole('status')).toHaveTextContent(`Loading ${plural}`);
    finish(respond({ error: 'UNAVAILABLE', message: 'Unavailable' }, 503));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(`No ${plural} yet.`);
  });

  it('rejects a blank name without sending a mutation', async () => {
    vi.stubGlobal('fetch', async (_url, options) => {
      expect(options.method).toBe('GET');
      return respond({ items: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } });
    });
    setup(Page);
    await screen.findByText(`No ${plural} yet.`);
    fireEvent.click(screen.getByRole('button', { name: `Create ${noun}` }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('form', { name: `Create ${noun}` }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
  });
});

it('renders nested categories, excludes descendants as parents, and creates a child', async () => {
  const child = item('child', 'Child', { parentId: 'root', children: [] });
  const root = item('root', 'Root', { parentId: null, children: [child] });
  vi.stubGlobal('fetch', async (url, options) => {
    if (options.method === 'POST') {
      expect(JSON.parse(options.body)).toEqual({ name: 'New child', parentId: 'root' });
      return respond(item('new', 'New child'), 201);
    }
    expect(url).toBe('/api/categories?tree=true');
    return respond({ items: [root] });
  });
  const view = setup(CategoriesPage);
  await screen.findByText('Child');
  const rootRow = view.container.querySelector('li');
  expect(within(rootRow).getByText('Child')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Delete Root' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Root' }));
  expect(
    within(screen.getByLabelText('Parent category')).queryByRole('option', { name: /Root|Child/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create category' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New child' } });
  fireEvent.change(screen.getByLabelText('Parent category'), { target: { value: 'root' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
  await screen.findByText('Category created.');
});

it('paginates tags and recovers the last page after deletion', async () => {
  let deleted = false;
  vi.stubGlobal('fetch', async (url, options) => {
    if (options.method === 'DELETE') {
      deleted = true;
      return respond(null, 204);
    }
    const page = Number(new URL(url, 'http://localhost').searchParams.get('page'));
    return respond({
      items: page === 2 ? (deleted ? [] : [item('last', 'Last')]) : [item('first', 'First')],
      pagination: { page, limit: 50, total: deleted ? 50 : 51, totalPages: deleted ? 1 : 2 },
    });
  });
  setup(TagsPage);
  await screen.findByText('First');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('Last');
  fireEvent.click(screen.getByRole('button', { name: 'Delete Last' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete tag' }));
  await screen.findByText('First');
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});
