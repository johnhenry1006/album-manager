import { useMemo } from 'react';

import { DISPLAY_VARIANT_TYPES } from '../constants/mediaConstants.js';

/** Derive display sources from list/detail data without requesting originals. */
export function useMediaVariants(media) {
  return useMemo(() => {
    const variants = (media?.variants ?? []).filter((variant) =>
      DISPLAY_VARIANT_TYPES.includes(variant.type),
    );
    const thumbnail =
      variants.find((variant) => variant.type === 'THUMBNAIL') ?? media?.thumbnails?.[0] ?? null;
    const preview =
      variants.find((variant) => variant.type === 'PREVIEW') ??
      variants.find((variant) => variant.type === 'OPTIMIZED') ??
      thumbnail;
    const placeholder = variants.find((variant) => variant.type === 'BLUR_PLACEHOLDER') ?? null;
    return { variants, thumbnail, preview, placeholder };
  }, [media]);
}
