import { httpClient } from '@/services/httpClient.js';
import { buildQueryString } from '@/utils/buildQueryString.js';

const albumPath = (id) => `albums/${encodeURIComponent(id)}`;

/** Private transport adapter. Cache policy belongs to feature hooks. */
export const albumApi = {
  list: (params, { signal } = {}) =>
    httpClient.request(`albums${buildQueryString(params)}`, { signal }),
  detail: (id, { signal } = {}) => httpClient.request(albumPath(id), { signal }),
  create: (body) => httpClient.request('albums', { method: 'POST', body }),
  update: (id, body) => httpClient.request(albumPath(id), { method: 'PATCH', body }),
  delete: (id) => httpClient.request(albumPath(id), { method: 'DELETE' }),
  listMedia: (id, params, { signal } = {}) =>
    httpClient.request(`${albumPath(id)}/media${buildQueryString(params)}`, { signal }),
  addMedia: (id, body) => httpClient.request(`${albumPath(id)}/media`, { method: 'POST', body }),
  removeMedia: (id, mediaId) =>
    httpClient.request(`${albumPath(id)}/media/${encodeURIComponent(mediaId)}`, {
      method: 'DELETE',
    }),
};
