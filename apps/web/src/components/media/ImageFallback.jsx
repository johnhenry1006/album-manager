import styles from './ResponsiveImage.module.css';

/** Local markup only: a failed image never triggers a fallback image request. */
export function ImageFallback({ alt = '', message = 'Image unavailable', className = '' }) {
  return (
    <div
      className={`${styles.fallback} ${className}`}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <span>{message}</span>
    </div>
  );
}
