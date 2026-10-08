import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './apiError.js';
import { createHttpClient, httpClient } from './httpClient.js';

afterEach(() => vi.unstubAllGlobals());

function clientWithResponse(body, options = {}) {
  const fetchImpl = vi.fn().mockResolvedValue(new Response(body, options));
  return {
    client: createHttpClient({ baseUrl: 'https://api.example.test/api/', fetchImpl }),
    fetchImpl,
  };
}

describe('HTTP client', () => {
  it('uses the configured API prefix and decodes JSON', async () => {
    const { client, fetchImpl } = clientWithResponse('{"items":[]}', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(await client.request('/media?limit=20')).toEqual({ items: [] });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.test/api/media?limit=20');
    expect(options.method).toBe('GET');
    expect(options.headers.get('Accept')).toBe('application/json');
    expect(options.headers.has('Content-Type')).toBe(false);
  });

  it('supports the default same-origin base', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchImpl);
    await httpClient.request('health');
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/health');
  });

  it('serializes JSON bodies and merges request headers', async () => {
    const { client, fetchImpl } = clientWithResponse('{"id":"a1"}', {
      headers: { 'Content-Type': 'application/json' },
    });
    await client.request('albums', {
      method: 'POST',
      body: { name: 'Summer' },
      headers: { 'X-Request-ID': 'client-1' },
    });
    const options = fetchImpl.mock.calls[0][1];
    expect(options.body).toBe('{"name":"Summer"}');
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(options.headers.get('X-Request-ID')).toBe('client-1');
  });

  it.each([204, 205])('returns null for a %s response', async (status) => {
    const { client } = clientWithResponse(null, { status });
    expect(await client.request('media/1', { method: 'DELETE' })).toBeNull();
  });

  it('returns null for HEAD and empty bodies', async () => {
    const { client } = clientWithResponse('');
    expect(await client.request('health', { method: 'HEAD' })).toBeNull();
    expect(await client.request('health')).toBeNull();
  });

  it('accepts JSON media types with a +json suffix', async () => {
    const { client } = clientWithResponse('{"ok":true}', {
      headers: { 'Content-Type': 'application/vnd.example+json; charset=utf-8' },
    });
    expect(await client.request('health')).toEqual({ ok: true });
  });

  it('normalizes the backend error envelope using the actual HTTP status', async () => {
    const { client } = clientWithResponse(
      JSON.stringify({
        statusCode: 500,
        error: 'VALIDATION_ERROR',
        message: 'Invalid request input',
        requestId: 'req-1',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
    await expect(client.request('albums')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request input',
      requestId: 'req-1',
    });
  });

  it.each([
    ['<html>private proxy details</html>', 'text/html'],
    ['{broken', 'application/json'],
    ['{"error":7,"message":{},"requestId":[]}', 'application/json'],
  ])('normalizes unusable HTTP error payloads safely', async (body, contentType) => {
    const { client } = clientWithResponse(body, {
      status: 502,
      headers: { 'Content-Type': contentType },
    });
    await expect(client.request('health')).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
      message: 'Request failed (502).',
      requestId: null,
    });
  });

  it.each([
    ['{broken', 'application/json'],
    ['<html>app shell</html>', 'text/html'],
  ])('rejects invalid successful responses', async (body, contentType) => {
    const { client } = clientWithResponse(body, { headers: { 'Content-Type': contentType } });
    await expect(client.request('health')).rejects.toMatchObject({
      status: 200,
      code: 'INVALID_RESPONSE',
    });
  });

  it('normalizes network failures without exposing raw messages or retrying', async () => {
    const cause = new TypeError('private network details');
    const fetchImpl = vi.fn().mockRejectedValue(cause);
    const client = createHttpClient({ fetchImpl });
    await expect(client.request('health')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the API.',
      cause,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('forwards the AbortSignal and preserves in-flight cancellation', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const client = createHttpClient({ fetchImpl });
    const request = client.request('media', { signal: controller.signal });
    const reason = new DOMException('Cancelled by caller', 'AbortError');
    const assertion = expect(request).rejects.toBe(reason);
    controller.abort(reason);
    await assertion;
    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('does not start an already-cancelled request', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Cancelled by caller'));
    const fetchImpl = vi.fn();
    const client = createHttpClient({ fetchImpl });
    await expect(client.request('media', { signal: controller.signal })).rejects.toBe(
      controller.signal.reason,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves cancellation while consuming a response body', async () => {
    const controller = new AbortController();
    const response = new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    vi.spyOn(response, 'text').mockImplementation(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    const client = createHttpClient({ fetchImpl: vi.fn().mockResolvedValue(response) });
    await expect(client.request('media', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('exposes reusable Error instances', () => {
    const error = new ApiError('Unable to load', {
      status: 404,
      code: 'HTTP_ERROR',
      requestId: 'req-1',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'HTTP_ERROR',
      requestId: 'req-1',
    });
  });

  it.each(['https://other.test/media', '//other.test/media', ''])(
    'rejects invalid endpoint paths: %s',
    async (path) => {
      const fetchImpl = vi.fn();
      const client = createHttpClient({ fetchImpl });
      await expect(client.request(path)).rejects.toBeInstanceOf(TypeError);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});
