import { useMemo } from 'react';

import { DISPLAY_VARIANT_TYPES } from '../constants/mediaConstants.js';

/** Derive display sources from list/detail data without requesting originals. */
export function useMediaVariants(media, { allowThumbnailFallback = true } = {}) {
  return useMemo(() => {
    const variants = (media?.variants ?? []).filter((variant) =>
      DISPLAY_VARIANT_TYPES.includes(variant.type),
    );
    const playback =
      media?.type === 'VIDEO'
        ? (variants.find((variant) => variant.type === 'OPTIMIZED' && variant.format === 'mp4') ??
          null)
        : null;
    const images = variants.filter((variant) => !['mp4', 'mov', 'webm'].includes(variant.format));
    const thumbnail =
      images.find((variant) => variant.type === 'THUMBNAIL') ?? media?.thumbnails?.[0] ?? null;
    const preview =
      images.find((variant) => variant.type === 'PREVIEW') ??
      images.find((variant) => variant.type === 'OPTIMIZED') ??
      (allowThumbnailFallback ? thumbnail : null);
    const placeholder = images.find((variant) => variant.type === 'BLUR_PLACEHOLDER') ?? null;
    return { variants, thumbnail, preview, placeholder, playback };
  }, [media, allowThumbnailFallback]);
}
