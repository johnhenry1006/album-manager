import { httpClient } from '@/services/httpClient.js';

export const dashboardApi = {
  summary: ({ signal } = {}) => httpClient.request('dashboard', { signal }),
};
