import { httpClient } from '@/services/httpClient.js';

import { mediaQueryString } from '../utils/mediaQueryString.js';

const mediaPath = (mediaId) => `media/${encodeURIComponent(mediaId)}`;

/** Private HTTP-only adapter. Query state and cache policy belong in hooks. */
export const mediaApi = {
  list: (params, { signal } = {}) =>
    httpClient.request(`media${mediaQueryString(params)}`, { signal }),
  detail: (mediaId, { signal } = {}) => httpClient.request(mediaPath(mediaId), { signal }),
  listTrash: (params, { signal } = {}) =>
    httpClient.request(`trash${mediaQueryString(params)}`, { signal }),
  favorite: (mediaId) => httpClient.request(`${mediaPath(mediaId)}/favorite`, { method: 'POST' }),
  unfavorite: (mediaId) =>
    httpClient.request(`${mediaPath(mediaId)}/favorite`, { method: 'DELETE' }),
  trash: (mediaId) => httpClient.request(mediaPath(mediaId), { method: 'DELETE' }),
  restore: (mediaId) =>
    httpClient.request(`trash/${encodeURIComponent(mediaId)}/restore`, { method: 'POST' }),
  permanentDelete: (mediaId, confirm) =>
    httpClient.request(`trash/${encodeURIComponent(mediaId)}/permanent`, {
      method: 'DELETE',
      body: { confirm },
    }),
};
