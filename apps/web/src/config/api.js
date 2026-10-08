/** Accept only public HTTP(S) URLs or same-origin absolute paths. */
export function resolveApiBaseUrl(value) {
  if (value === undefined || (typeof value === 'string' && !value.trim())) return '/api';
  if (typeof value !== 'string') throw new TypeError('API base URL must be a string.');

  const baseUrl = value.trim();
  if (/[?#\\\s]/u.test(baseUrl)) {
    throw new TypeError(
      'API base URL must not contain a query, fragment, whitespace, or backslash.',
    );
  }

  if (baseUrl.startsWith('/') && !baseUrl.startsWith('//')) {
    return baseUrl.replace(/\/+$/u, '') || '/';
  }

  if (!/^https?:\/\//u.test(baseUrl)) {
    throw new TypeError('API base URL must be an HTTP(S) URL or a same-origin absolute path.');
  }
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError('API base URL is invalid.');
  }
  if (url.username || url.password) {
    throw new TypeError('API base URL must not contain credentials.');
  }
  return url.href.replace(/\/+$/u, '');
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
