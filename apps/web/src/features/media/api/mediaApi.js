import { httpClient } from '@/services/httpClient.js';

import { mediaQueryString } from '../utils/mediaQueryString.js';

const mediaPath = (mediaId) => `media/${encodeURIComponent(mediaId)}`;

/** Private HTTP-only adapter. Query state and cache policy belong in hooks. */
export const mediaApi = {
  list: (params, { signal } = {}) =>
    httpClient.request(`media${mediaQueryString(params)}`, { signal }),
  detail: (mediaId, { signal } = {}) => httpClient.request(mediaPath(mediaId), { signal }),
  originalUrl: (mediaId) => httpClient.request(`${mediaPath(mediaId)}/original-url`),
  favorite: (mediaId) => httpClient.request(`${mediaPath(mediaId)}/favorite`, { method: 'POST' }),
  unfavorite: (mediaId) =>
    httpClient.request(`${mediaPath(mediaId)}/favorite`, { method: 'DELETE' }),
  trash: (mediaId) => httpClient.request(mediaPath(mediaId), { method: 'DELETE' }),
};
