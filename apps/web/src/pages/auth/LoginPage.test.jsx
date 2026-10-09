import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { App } from '@/app/App.jsx';
import { AppProviders } from '@/app/providers/AppProviders.jsx';
afterEach(() => vi.unstubAllGlobals());
it('redirects to sign-in and returns to the requested protected page after login', async () => {
  const requests = [];
  vi.stubGlobal('fetch', async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/auth/login'))
      return Response.json({ user: { id: 'a', email: 'a@example.com' }, csrfToken: 'csrf' });
    return Response.json({}, { status: url.endsWith('/auth/me') ? 401 : 500 });
  });
  render(
    <AppProviders>
      <MemoryRouter initialEntries={['/settings/storage']}>
        <App />
      </MemoryRouter>
    </AppProviders>,
  );
  await screen.findByRole('heading', { name: 'Sign in to Album Manager' });
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'a@example.com');
  await user.type(screen.getByLabelText('Password'), 'a very long password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('heading', { name: 'Storage', exact: true });
  const login = requests.find(({ url }) => url.endsWith('/auth/login'));
  expect(JSON.parse(login.options.body)).toEqual({
    email: 'a@example.com',
    password: 'a very long password',
  });
  expect(login.options.headers.get('X-Auth-Request')).toBe('1');
});
it('retains the draft and allows retry after a failed login', async () => {
  vi.stubGlobal('fetch', async () => Response.json({}, { status: 401 }));
  render(
    <AppProviders>
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    </AppProviders>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'a@example.com');
  await user.type(screen.getByLabelText('Password'), 'a very long password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Email')).toHaveValue('a@example.com');
  expect(screen.getByLabelText('Password')).toHaveValue('a very long password');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
});
