import { httpClient } from '@/services/httpClient.js';
import { buildQueryString } from '@/utils/buildQueryString.js';

const entityPath = (id) => `categories/${encodeURIComponent(id)}`;

/** Private HTTP-only adapter; feature hooks own query and mutation policy. */
export const categoryApi = {
  list: (params, { signal } = {}) =>
    httpClient.request(`categories${buildQueryString(params)}`, { signal }),
  create: (body) => httpClient.request('categories', { method: 'POST', body }),
  update: (id, body) => httpClient.request(entityPath(id), { method: 'PATCH', body }),
  delete: (id) => httpClient.request(entityPath(id), { method: 'DELETE' }),
  assignToMedia: (mediaId, categoryIds) =>
    httpClient.request(`media/${encodeURIComponent(mediaId)}/categories`, {
      method: 'POST',
      body: { categoryIds },
    }),
  assignToManyMedia: (mediaIds, categoryIds) =>
    httpClient.request('media/categories', { method: 'POST', body: { mediaIds, categoryIds } }),
};
