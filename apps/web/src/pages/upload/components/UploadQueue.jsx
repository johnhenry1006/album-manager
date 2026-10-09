import { useState } from 'react';

import styles from '../UploadPage.module.css';
import { UploadQueueItem } from './UploadQueueItem.jsx';

export function UploadQueue({ queue }) {
  const [requestedPage, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(queue.items.length / 50));
  const page = Math.min(requestedPage, totalPages);
  const visibleItems = queue.items.slice((page - 1) * 50, page * 50);
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
          {visibleItems.map((item) => (
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
      {queue.items.length > 0 && (
        <nav aria-label="Upload queue pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous page
          </button>{' '}
          <span>
            Page {page} of {totalPages}
          </span>{' '}
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next page
          </button>
        </nav>
      )}
    </section>
  );
}
