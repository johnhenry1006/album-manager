import { httpClient } from '@/services/httpClient.js';

/** Private HTTP adapter. Response handling and cache policy belong to feature hooks. */
export const settingsApi = {
  imageOptimization: ({ signal } = {}) =>
    httpClient.request('settings/image-optimization', { signal }),
  updateImageOptimization: (body) =>
    httpClient.request('settings/image-optimization', { method: 'PATCH', body }),
  storage: ({ signal } = {}) => httpClient.request('settings/storage', { signal }),
};
