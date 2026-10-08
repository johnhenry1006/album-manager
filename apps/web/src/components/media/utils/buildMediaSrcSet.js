/** Only explicitly identified thumbnail/preview descriptors can be image sources. */
export function getMediaImageVariants(variants = []) {
  if (!Array.isArray(variants)) return [];
  return variants.filter(
    (variant) =>
      variant &&
      ['THUMBNAIL', 'PREVIEW'].includes(variant.type) &&
      typeof variant.url === 'string' &&
      variant.url.length > 0 &&
      !/[\s,]/u.test(variant.url),
  );
}

/** Width descriptors; first source wins when multiple formats have the same width. */
export function buildMediaSrcSet(variants = []) {
  const byWidth = new Map();
  for (const variant of getMediaImageVariants(variants)) {
    if (Number.isSafeInteger(variant.width) && variant.width > 0 && !byWidth.has(variant.width)) {
      byWidth.set(variant.width, variant.url);
    }
  }
  return [...byWidth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([width, url]) => `${url} ${width}w`)
    .join(', ');
}
