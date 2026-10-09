import sharp from 'sharp';
import { expect, it, vi } from 'vitest';

import { SharpImageProcessor } from './sharpImageProcessor.js';

vi.mock('sharp', () => ({ default: vi.fn() }));
it.each([
    ['av1', 'image/avif'],
    ['hevc', 'image/heic'],
])('distinguishes decoded HEIF %s compression as %s', async (compression, mimeType) => {
    sharp.mockReturnValue({ metadata: async () => ({ format: 'heif', compression, width: 100, height: 50 }) });
    const source = await new SharpImageProcessor().inspect(Buffer.from('encoded source'));
    expect(source.mimeType).toBe(mimeType);
});
