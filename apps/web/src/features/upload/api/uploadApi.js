import { ApiError } from '@/services/apiError.js';
import { httpClient } from '@/services/httpClient.js';
import { buildQueryString } from '@/utils/buildQueryString.js';

import { uploadToStorage } from './uploadTransport.js';

const filePath = (id) => `uploads/files/${encodeURIComponent(id)}`;
const sessionPath = (id) => `uploads/sessions/${encodeURIComponent(id)}`;
const post = (path, body, signal) => httpClient.request(path, { method: 'POST', body, signal });

export const uploadApi = {
  createSession: ({ signal } = {}) => post('uploads/sessions', {}, signal),
  registerFile: (sessionId, body, { signal } = {}) =>
    post(`${sessionPath(sessionId)}/files`, body, signal),
  presign: (id, { signal } = {}) => post(`${filePath(id)}/presign`, {}, signal),
  complete: (id, { signal } = {}) => post(`${filePath(id)}/complete`, {}, signal),
  resolveDuplicate: (id, action, { signal } = {}) =>
    post(`${filePath(id)}/duplicate/resolve`, { action }, signal),
  getSessionPage: (id, params, { signal } = {}) =>
    httpClient.request(`${sessionPath(id)}${buildQueryString(params)}`, { signal }),
  async getSession(id, { signal } = {}) {
    const files = [];
    const cursors = new Set();
    let cursor;
    let session;
    do {
      session = await uploadApi.getSessionPage(id, { limit: 100, cursor }, { signal });
      if (!Array.isArray(session?.files))
        throw new ApiError('Invalid upload session response.', { code: 'INVALID_RESPONSE' });
      files.push(...session.files);
      cursor = session.nextCursor;
      if (cursor && cursors.has(cursor))
        throw new ApiError('Invalid upload session cursor.', { code: 'INVALID_RESPONSE' });
      cursors.add(cursor);
    } while (cursor);
    return { ...session, files, nextCursor: null };
  },
  uploadToStorage,
};
