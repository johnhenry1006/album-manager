import { Skeleton } from '@/components/ui/Skeleton.jsx';

import styles from './ResponsiveImage.module.css';

/** Decorative loading state; the owning image supplies its accessible description. */
export function ImagePlaceholder({ className = '' }) {
  return (
    <div className={`${styles.placeholder} ${className}`} aria-hidden="true" data-image-placeholder>
      <Skeleton className={styles.skeleton} />
    </div>
  );
}
