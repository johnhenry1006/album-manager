import { API_BASE_URL, resolveApiBaseUrl } from '@/config/api.js';

import { ApiError, normalizeApiError } from './apiError.js';

function endpointUrl(baseUrl, path) {
  if (
    typeof path !== 'string' ||
    !path.trim() ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(path) ||
    /[\\#\s]/u.test(path)
  ) {
    throw new TypeError('API endpoint must be a path relative to the API base URL.');
  }
  let pathname;
  try {
    pathname = decodeURIComponent(path.split('?')[0].replace(/^\/+/, ''));
  } catch {
    throw new TypeError('Invalid API path encoding.');
  }
  if (
    /[\\%]/u.test(pathname) ||
    pathname.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new TypeError('Unsafe API endpoint path.');
  return `${baseUrl.replace(/\/+$/u, '')}/${path.replace(/^\/+/, '')}`;
}

function isJsonResponse(response) {
  const type = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  return type === 'application/json' || /^application\/[\w.+-]+\+json$/u.test(type ?? '');
}

/** JSON-only API transport. Feature API modules own endpoint calls; this layer never retries. */
export function createHttpClient({
  baseUrl = API_BASE_URL,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const resolvedBaseUrl = resolveApiBaseUrl(baseUrl);
  let context;
  function configureRequestContext(value) {
    context = value;
    return () => {
      if (context === value) context = undefined;
    };
  }

  async function request(path, { method = 'GET', body, headers, signal } = {}) {
    signal?.throwIfAborted();
    const url = endpointUrl(resolvedBaseUrl, path);
    const captured = context;
    const version = captured?.getVersion?.();
    const requestHeaders = new Headers(captured?.getHeaders?.());
    new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));
    if (!requestHeaders.has('Accept')) requestHeaders.set('Accept', 'application/json');
    if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
    const options = {
      credentials: 'include',
      method: method.toUpperCase(),
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    };

    let response;
    try {
      response = await fetchImpl(url, options);
      signal?.throwIfAborted();
      if (response.ok && captured && (captured !== context || captured.getVersion?.() !== version)) {
        throw new ApiError('The request is no longer current.', { code: 'REQUEST_SUPERSEDED' });
      }
      if (response.ok && (options.method === 'HEAD' || [204, 205].includes(response.status))) {
        return null;
      }

      const text = await response.text();
      let payload = null;
      if (text && isJsonResponse(response)) {
        try {
          payload = JSON.parse(text);
        } catch (cause) {
          if (response.ok) {
            throw new ApiError('The API returned invalid JSON.', {
              status: response.status,
              code: 'INVALID_RESPONSE',
              cause,
            });
          }
        }
      }

      signal?.throwIfAborted();
      if (response.status === 401 && captured === context && captured?.getVersion?.() === version)
        captured?.onUnauthorized?.({ path });
      if (!response.ok) throw normalizeApiError(null, { status: response.status, payload });
      if (text && !isJsonResponse(response)) {
        throw new ApiError('The API returned an unexpected response format.', {
          status: response.status,
          code: 'INVALID_RESPONSE',
        });
      }
      return payload;
    } catch (error) {
      // AbortSignal reasons can be arbitrary values, not just AbortError instances.
      if (signal?.aborted) throw signal.reason;
      throw normalizeApiError(error, { status: response && !response.ok ? response.status : 0 });
    }
  }

  return { request, configureRequestContext };
}

export const httpClient = createHttpClient();
