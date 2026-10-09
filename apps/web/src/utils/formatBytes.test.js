import { expect, it } from 'vitest';

import { formatBytes } from './formatBytes.js';

it.each([
  ['0', '0 B'],
  ['1023', '1,023 B'],
  ['1024', '1 KiB'],
  ['1536', '1.5 KiB'],
  ['1048576', '1 MiB'],
  ['9007199254740993', '8 PiB'],
  [null, '—'],
  [undefined, '—'],
  ['bad', '—'],
  ['-1', '—'],
])('formats recorded byte count %s as %s', (value, expected) => {
  expect(formatBytes(value)).toBe(expected);
});
