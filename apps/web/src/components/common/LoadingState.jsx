import { Skeleton } from '@/components/ui/Skeleton.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import styles from './LoadingState.module.css';

/** Initial content placeholder. Incremental requests use Spinner beside retained content. */
export function LoadingState({ label = 'Loading', count = 3 }) {
  return (
    <div className={styles.loading} aria-busy="true">
      <Spinner label={label} />
      <div className={styles.placeholders}>
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className={styles.placeholder} />
        ))}
      </div>
    </div>
  );
}
