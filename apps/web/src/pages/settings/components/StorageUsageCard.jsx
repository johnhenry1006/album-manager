import { formatBytes } from '@/utils/formatBytes.js';

import styles from './StorageUsageCard.module.css';

const metrics = [
  { key: 'totalBytes', label: 'Total storage usage' },
  { key: 'originalBytes', label: 'Original size' },
  { key: 'optimizedBytes', label: 'Optimized size' },
  { key: 'variantBytes', label: 'All variants' },
  { key: 'estimatedSavedBytes', label: 'Estimated savings' },
];

export function StorageUsageCard({ storage }) {
  return (
    <section className={styles.card} aria-labelledby="storage-usage-title">
      <h2 id="storage-usage-title">Storage usage</h2>
      <dl className={styles.metrics}>
        <div>
          <dt>Provider</dt>
          <dd>{storage.providerType ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Bucket</dt>
          <dd>{storage.bucketName ?? 'Unavailable'}</dd>
        </div>
        {metrics.map(({ key, label }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd title={storage[key] !== undefined ? `${storage[key]} bytes` : undefined}>
              {formatBytes(storage[key])}
            </dd>
          </div>
        ))}
        {storage.objectCount !== undefined && storage.objectCount !== null && (
          <div>
            <dt>Objects</dt>
            <dd>{storage.objectCount.toLocaleString('en-US')}</dd>
          </div>
        )}
      </dl>
      <p className={styles.note}>
        Includes files in trash. All variants include optimized files, previews, and thumbnails.
      </p>
      <p className={styles.note}>
        Estimated savings compare optimized files with their originals. Originals remain stored.
      </p>
    </section>
  );
}
