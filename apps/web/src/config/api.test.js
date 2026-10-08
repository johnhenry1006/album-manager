import { describe, expect, it, vi } from 'vitest';

import { resolveApiBaseUrl } from './api.js';

describe('public API configuration', () => {
  it('reads the Vite public API base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
    vi.resetModules();
    try {
      const { API_BASE_URL } = await import('./api.js');
      expect(API_BASE_URL).toBe('https://api.example.test/v1');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
  it.each([undefined, '', '  '])('defaults an unset URL to /api', (value) => {
    expect(resolveApiBaseUrl(value)).toBe('/api');
  });

  it.each([
    ['/api/', '/api'],
    ['/', '/'],
    [' https://api.example.test/api/ ', 'https://api.example.test/api'],
    ['http://localhost:3000/api', 'http://localhost:3000/api'],
  ])('normalizes %s', (value, expected) => {
    expect(resolveApiBaseUrl(value)).toBe(expected);
  });

  it.each([
    'api',
    '//other.test/api',
    'ftp://other.test/api',
    'https://user:secret@other.test/api',
    '/api?key=x',
    '/api#x',
    'http://',
    42,
  ])('rejects invalid public configuration: %s', (value) => {
    expect(() => resolveApiBaseUrl(value)).toThrow(TypeError);
  });
});
