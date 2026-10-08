import styles from '../UploadPage.module.css';
import { UploadQueueItem } from './UploadQueueItem.jsx';

export function UploadQueue({ queue }) {
  const completed = queue.items.filter((item) => item.status === 'completed').length;
  return (
    <section aria-label="Upload queue" className={styles.panel}>
      <h2>Upload queue</h2>
      <p>
        {queue.items.length} files · {completed} completed
      </p>
      <div className={styles.actions}>
        <button type="button" disabled={queue.queuedCount === 0} onClick={queue.start}>
          Upload queued files
        </button>
        <button
          type="button"
          disabled={!queue.isBusy && queue.queuedCount === 0}
          onClick={queue.cancelAll}
        >
          Cancel all
        </button>
        <button
          type="button"
          disabled={
            !queue.items.some((item) =>
              ['completed', 'skipped', 'cancelled', 'invalid'].includes(item.status),
            )
          }
          onClick={queue.clearFinished}
        >
          Clear finished
        </button>
      </div>
      {queue.items.length === 0 ? (
        <p>Add files to begin.</p>
      ) : (
        <ul className={styles.queue}>
          {queue.items.map((item) => (
            <UploadQueueItem
              key={item.id}
              item={item}
              onRetry={queue.retry}
              onCancel={queue.cancel}
              onRemove={queue.remove}
              onResolve={queue.resolveDuplicate}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
