import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { httpClient } from '@/services/httpClient.js';

import { useAuth } from '../hooks/useAuth.js';
import { AuthProvider } from './AuthProvider.jsx';
let client;
afterEach(() => {
  client?.clear();
  vi.unstubAllGlobals();
});
function Probe() {
  const auth = useAuth();
  return (
    <>
      <span>
        {auth.status}:{auth.user?.email ?? 'anonymous'}
      </span>
      <button
        onClick={() => auth.login({ email: 'a@example.com', password: 'a very long password' })}
      >
        Login
      </button>
      <button onClick={auth.logout}>Logout</button>
    </>
  );
}
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}
it('logs in with credentials, clears library data, and logs out with CSRF', async () => {
  const requests = [];
  vi.stubGlobal('fetch', async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/auth/me'))
      return new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/auth/login'))
      return Response.json({ user: { id: 'a', email: 'a@example.com' }, csrfToken: 'csrf' });
    return new Response(null, { status: 204 });
  });
  mount();
  await screen.findByText('signedOut:anonymous');
  client.setQueryData(['media'], { private: true });
  await act(async () => screen.getByText('Login').click());
  expect(screen.getByText('authenticated:a@example.com')).toBeInTheDocument();
  expect(client.getQueryData(['media'])).toBeUndefined();
  expect(requests.find(({ url }) => url.endsWith('/auth/login')).options.credentials).toBe(
    'include',
  );
  await act(async () => screen.getByText('Logout').click());
  expect(screen.getByText('signedOut:anonymous')).toBeInTheDocument();
  expect(
    requests.find(({ url }) => url.endsWith('/auth/logout')).options.headers.get('X-CSRF-Token'),
  ).toBe('csrf');
});
it('expires centrally on a protected API 401 and clears query data', async () => {
  vi.stubGlobal('fetch', async (url) =>
    url.endsWith('/auth/me')
      ? Response.json({ user: { id: 'a', email: 'a@example.com' }, csrfToken: 'csrf' })
      : new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } }),
  );
  mount();
  await screen.findByText('authenticated:a@example.com');
  client.setQueryData(['media'], ['private']);
  await act(async () => {
    await expect(httpClient.request('media')).rejects.toMatchObject({ status: 401 });
  });
  await waitFor(() => expect(screen.getByText('signedOut:anonymous')).toBeInTheDocument());
  expect(client.getQueryData(['media'])).toBeUndefined();
});
it('does not restore an old session after logout races a focus refresh', async () => {
  let resolveRefresh;
  let calls = 0;
  vi.stubGlobal('fetch', async (url) => {
    if (!url.endsWith('/auth/me')) return new Response(null, { status: 204 });
    if (++calls === 1)
      return Response.json({ user: { id: 'a', email: 'a@example.com' }, csrfToken: 'csrf' });
    return new Promise((resolve) => {
      resolveRefresh = resolve;
    });
  });
  mount();
  await screen.findByText('authenticated:a@example.com');
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(resolveRefresh).toBeTypeOf('function'));
  await act(async () => screen.getByText('Logout').click());
  await act(async () =>
    resolveRefresh(Response.json({ user: { id: 'a', email: 'a@example.com' }, csrfToken: 'csrf' })),
  );
  expect(screen.getByText('signedOut:anonymous')).toBeInTheDocument();
});
it('clears old library data when a focus refresh discovers a different account', async () => {
  let identity = 'a';
  vi.stubGlobal('fetch', async () =>
    Response.json({ user: { id: identity, email: `${identity}@example.com` }, csrfToken: 'csrf' }),
  );
  mount();
  await screen.findByText('authenticated:a@example.com');
  client.setQueryData(['media'], ['private-a']);
  identity = 'b';
  act(() => window.dispatchEvent(new Event('focus')));
  await screen.findByText('authenticated:b@example.com');
  expect(client.getQueryData(['media'])).toBeUndefined();
});
it('unmounts the old identity and suspends focus refresh during login', async () => {
  let finishLogin;
  let meCalls = 0;
  vi.stubGlobal('fetch', async (url) => {
    if (url.endsWith('/auth/me')) {
      meCalls++;
      return Response.json({
        user: { id: 'old', email: 'old@example.com' },
        csrfToken: 'old-csrf',
      });
    }
    return new Promise((resolve) => {
      finishLogin = resolve;
    });
  });
  mount();
  await screen.findByText('authenticated:old@example.com');
  act(() => screen.getByText('Login').click());
  await waitFor(() => expect(finishLogin).toBeTypeOf('function'));
  expect(screen.getByText('loading:anonymous')).toBeInTheDocument();
  act(() => window.dispatchEvent(new Event('focus')));
  expect(meCalls).toBe(1);
  await act(async () =>
    finishLogin(
      Response.json({ user: { id: 'new', email: 'a@example.com' }, csrfToken: 'new-csrf' }),
    ),
  );
  expect(screen.getByText('authenticated:a@example.com')).toBeInTheDocument();
});
