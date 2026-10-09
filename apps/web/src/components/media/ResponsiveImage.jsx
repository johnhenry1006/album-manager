import { useCallback, useState } from 'react';

import { ImageFallback } from './ImageFallback.jsx';
import { ImagePlaceholder } from './ImagePlaceholder.jsx';
import styles from './ResponsiveImage.module.css';
import { buildMediaSrcSet, getMediaImageVariants } from './utils/buildMediaSrcSet.js';

const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

function ImageContent({
  src,
  srcSet,
  sizes,
  alt,
  width,
  height,
  ratio,
  className,
  objectFit,
  onLoad,
  onError,
}) {
  const [status, setStatus] = useState(src ? 'loading' : 'error');
  // Cached images may finish before React attaches a load listener.
  const imageRef = useCallback((image) => {
    if (image?.complete) setStatus(image.naturalWidth > 0 ? 'loaded' : 'error');
  }, []);
  return (
    <div
      className={`${styles.frame} ${className}`}
      style={{ aspectRatio: ratio }}
      aria-busy={status === 'loading'}
    >
      {status === 'loading' && <ImagePlaceholder />}
      {status === 'error' ? (
        <ImageFallback alt={alt} />
      ) : (
        <img
          ref={imageRef}
          className={styles.image}
          src={src}
          srcSet={srcSet || undefined}
          sizes={sizes}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          style={{ objectFit, opacity: status === 'loaded' ? 1 : 0 }}
          onLoad={(event) => {
            setStatus('loaded');
            onLoad?.(event);
          }}
          onError={(event) => {
            setStatus('error');
            onError?.(event);
          }}
        />
      )}
    </div>
  );
}

/**
 * Presentation only. Accept typed THUMBNAIL/PREVIEW variants, or the compact
 * gallery's thumbnails array. No raw src or original URL fallback is accepted.
 * Pass sizes matching the actual layout; dimensions/ratio reserve its box.
 */
export function ResponsiveImage({
  variants = [],
  thumbnails = [],
  alt = '',
  sizes = '100vw',
  width,
  height,
  aspectRatio,
  objectFit = 'cover',
  className = '',
  onLoad,
  onError,
}) {
  const sources = getMediaImageVariants([
    ...(Array.isArray(variants) ? variants : []),
    ...(Array.isArray(thumbnails) ? thumbnails : []).filter(Boolean).map((thumbnail) => ({
      ...thumbnail,
      type: thumbnail.type ?? 'THUMBNAIL',
    })),
  ]);
  // Prefer the smallest derivative for browsers without responsive-image support.
  const source = [...sources].sort(
    (a, b) => (positive(a.width) ? a.width : Infinity) - (positive(b.width) ? b.width : Infinity),
  )[0];
  const dimensions =
    positive(width) && positive(height)
      ? { width, height }
      : positive(source?.width) && positive(source?.height)
        ? { width: source.width, height: source.height }
        : {};
  const ratio = positive(aspectRatio)
    ? aspectRatio
    : dimensions.width
      ? dimensions.width / dimensions.height
      : 1;
  const srcSet = buildMediaSrcSet(sources);
  return (
    <ImageContent
      key={JSON.stringify([source?.url, srcSet])}
      src={source?.url}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      {...dimensions}
      ratio={ratio}
      className={className}
      objectFit={objectFit}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
