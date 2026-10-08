import { expect, it } from 'vitest';

import { buildMediaSrcSet } from './buildMediaSrcSet.js';

it('builds sorted, unique width descriptors from thumbnail and preview variants', () => {
  const variants = [
    { type: 'PREVIEW', width: 1600, url: '/preview.webp' },
    { type: 'THUMBNAIL', width: 320, url: '/small.webp' },
    { type: 'THUMBNAIL', width: 640, url: '/medium.webp' },
    { type: 'THUMBNAIL', width: 320, url: '/duplicate.jpg' },
    { type: 'ORIGINAL', width: 4000, url: '/original.jpg' },
  ];
  expect(buildMediaSrcSet(variants)).toBe(
    '/small.webp 320w, /medium.webp 640w, /preview.webp 1600w',
  );
  expect(variants[0].width).toBe(1600);
});

it('omits missing widths, malformed descriptors and non-display sources', () => {
  expect(
    buildMediaSrcSet([
      null,
      { type: 'THUMBNAIL', url: '/no-width.webp' },
      { type: 'THUMBNAIL', width: 0, url: '/zero.webp' },
      { type: 'PREVIEW', width: 2.5, url: '/fraction.webp' },
      { type: 'PREVIEW', width: 400, url: '' },
      { type: 'PREVIEW', width: 400, url: '/image name.webp' },
      { type: 'PREVIEW', width: 400, url: '/image,other.webp' },
      { type: 'OPTIMIZED', width: 800, url: '/optimized.webp' },
      { width: 4000, url: '/untyped-original.jpg' },
    ]),
  ).toBe('');
  expect(buildMediaSrcSet()).toBe('');
  expect(buildMediaSrcSet(null)).toBe('');
});

it('preserves signed query strings in responsive sources', () => {
  expect(
    buildMediaSrcSet([
      { type: 'PREVIEW', width: 800, url: 'https://cdn.example/image.webp?sig=a%2Bb&expires=900' },
    ]),
  ).toBe('https://cdn.example/image.webp?sig=a%2Bb&expires=900 800w');
});
