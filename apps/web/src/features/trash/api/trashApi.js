import { httpClient } from '@/services/httpClient.js';
import { buildQueryString } from '@/utils/buildQueryString.js';

const trashPath = (mediaId) => `trash/${encodeURIComponent(mediaId)}`;

/** Private transport adapter for the trash collection and its lifecycle. */
export const trashApi = {
  list: (params, { signal } = {}) =>
    httpClient.request(`trash${buildQueryString(params)}`, { signal }),
  restore: (mediaId) => httpClient.request(`${trashPath(mediaId)}/restore`, { method: 'POST' }),
  permanentDelete: (mediaId) =>
    httpClient.request(`${trashPath(mediaId)}/permanent`, {
      method: 'DELETE',
      body: { confirm: true },
    }),
};
