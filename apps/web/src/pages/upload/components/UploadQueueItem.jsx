import { Link } from 'react-router';

import styles from '../UploadPage.module.css';

const labels = {
  queued: 'Queued',
  pending: 'Waiting to upload',
  assigning: 'Assigning selections…',
  completed: 'Completed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
  invalid: 'Invalid file',
  failed: 'Failed',
};
const duplicateLabels = { SKIP: 'Skip', USE_EXISTING: 'Use existing', KEEP_BOTH: 'Keep both' };
export function UploadQueueItem({ item, onRetry, onCancel, onRemove, onResolve }) {
  const upload = item.upload;
  const active = ['pending', 'running', 'assigning'].includes(item.status);
  const duplicate = item.status === 'running' && upload?.needsDuplicateResolution;
  const progress = upload?.progress;
  let label = labels[item.status];
  if (item.status === 'running')
    label = duplicate
      ? 'Duplicate detected'
      : upload?.isActiveResolution
        ? 'Resolving duplicate…'
        : upload?.status === 'PROCESSING'
          ? 'Processing media…'
          : progress?.isUploading
            ? 'Uploading'
            : 'Preparing upload…';
  return (
    <li aria-label={item.file.name} className={styles.item}>
      <div className={styles.itemHeading}>
        <strong>{item.file.name}</strong>
        <span>{(item.file.size / 1024 ** 2).toFixed(2)} MiB</span>
      </div>
      <p role="status">{label}</p>
      {progress?.isUploading && item.status === 'running' && (
        <div>
          <label htmlFor={`progress-${item.id}`}>
            Upload progress{progress.percent !== null ? ` ${progress.percent}%` : ''}
          </label>
          <progress id={`progress-${item.id}`} max="100" value={progress.percent ?? undefined} />
        </div>
      )}
      {duplicate && (
        <div role="group" aria-label={`Resolve duplicate for ${item.file.name}`}>
          <p>This file matches existing media. Choose how to continue.</p>
          <div className={styles.actions}>
            {upload.duplicateActions.map((action) => (
              <button key={action} type="button" onClick={() => onResolve(item.id, action)}>
                {duplicateLabels[action]}
              </button>
            ))}
          </div>
        </div>
      )}
      {item.error && <p role="alert">{item.error.message}</p>}
      {item.status === 'failed' && item.finalMediaId && (
        <p>Upload is ready; retry the remaining assignments.</p>
      )}
      <div className={styles.actions}>
        {item.canRetry && !active && (
          <button type="button" onClick={() => onRetry(item.id)}>
            Retry
          </button>
        )}
        {(active || item.status === 'queued') && (
          <button type="button" onClick={() => onCancel(item.id)}>
            Cancel
          </button>
        )}
        {!active && (
          <button type="button" onClick={() => onRemove(item.id)}>
            Remove
          </button>
        )}
        {item.finalMediaId && (
          <Link to={`/media/${encodeURIComponent(item.finalMediaId)}`}>View media</Link>
        )}
      </div>
    </li>
  );
}
