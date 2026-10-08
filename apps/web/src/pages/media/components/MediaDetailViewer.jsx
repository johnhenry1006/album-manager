import { useState } from 'react';

import { ErrorState } from '@/components/common/ErrorState.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import styles from './MediaDetail.module.css';

function PreviewImage({ preview, filename, onRefresh }) {
  const [status, setStatus] = useState('loading');
  return status === 'error' ? (
    <ErrorState
      title="Could not load preview"
      description="Refresh the preview and try again."
      onRetry={() => {
        setStatus('loading');
        onRefresh();
      }}
    />
  ) : (
    <div aria-busy={status === 'loading'} className={styles.preview}>
      {status === 'loading' && <Spinner label="Loading preview" />}
      <img
        src={preview.url}
        alt={filename}
        width={preview.width}
        height={preview.height}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  );
}

export function MediaDetailViewer({ media, preview, original, onRefresh }) {
  return (
    <section aria-label="Media viewer" className={styles.viewer}>
      {preview?.url ? (
        <PreviewImage
          key={preview.url}
          preview={preview}
          filename={media.originalFilename}
          onRefresh={onRefresh}
        />
      ) : (
        <p>No preview available</p>
      )}
      <div className={styles.actions}>
        <button type="button" disabled={original.disabled} onClick={original.request}>
          {original.isPending
            ? 'Preparing original…'
            : original.data
              ? 'Refresh original link'
              : 'Open original'}
        </button>
        {original.data && (
          <a href={original.data.url} target="_blank" rel="noopener noreferrer">
            View original
          </a>
        )}
      </div>
      {original.error && (
        <ErrorState
          title="Could not open original"
          description={original.error.message}
          onRetry={original.request}
        />
      )}
    </section>
  );
}
