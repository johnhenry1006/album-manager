import { httpClient } from '@/services/httpClient.js';
export const authApi = {
  me: ({ signal } = {}) => httpClient.request('auth/me', { signal }),
  login: (body) =>
    httpClient.request('auth/login', { method: 'POST', body, headers: { 'X-Auth-Request': '1' } }),
  logout: () => httpClient.request('auth/logout', { method: 'POST' }),
};
