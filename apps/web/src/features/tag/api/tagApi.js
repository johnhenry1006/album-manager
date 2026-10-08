import { httpClient } from '@/services/httpClient.js';
import { buildQueryString } from '@/utils/buildQueryString.js';

const entityPath = (id) => `tags/${encodeURIComponent(id)}`;

/** Private HTTP-only adapter; feature hooks own query and mutation policy. */
export const tagApi = {
  list: (params, { signal } = {}) =>
    httpClient.request(`tags${buildQueryString(params)}`, { signal }),
  create: (body) => httpClient.request('tags', { method: 'POST', body }),
  update: (id, body) => httpClient.request(entityPath(id), { method: 'PATCH', body }),
  delete: (id) => httpClient.request(entityPath(id), { method: 'DELETE' }),
  assignToMedia: (mediaId, tagIds) =>
    httpClient.request(`media/${encodeURIComponent(mediaId)}/tags`, {
      method: 'POST',
      body: { tagIds },
    }),
  assignToManyMedia: (mediaIds, tagIds) =>
    httpClient.request('media/tags', { method: 'POST', body: { mediaIds, tagIds } }),
};
