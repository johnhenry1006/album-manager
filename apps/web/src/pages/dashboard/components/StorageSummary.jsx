import { formatBytes } from '@/utils/formatBytes.js';

import styles from './Dashboard.module.css';

const metrics = [
  { key: 'originalBytes', label: 'Original storage' },
  { key: 'optimizedBytes', label: 'Optimized storage' },
  { key: 'estimatedSavedBytes', label: 'Estimated savings' },
];

export function StorageSummary({ storage }) {
  return (
    <section className={styles.panel} aria-labelledby="storage-summary-title">
      <h2 id="storage-summary-title">Storage summary</h2>
      <dl className={styles.storageStats}>
        {metrics.map(({ key, label }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd
              title={
                storage?.[key] !== undefined && storage?.[key] !== null
                  ? `${storage[key]} bytes`
                  : undefined
              }
            >
              {formatBytes(storage?.[key])}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>
        Estimated savings compare optimized files with their originals. Originals remain stored.
        Totals exclude trash.
      </p>
    </section>
  );
}
