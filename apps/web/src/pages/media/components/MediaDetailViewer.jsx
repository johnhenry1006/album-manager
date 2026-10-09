import { useState } from 'react';

import { EmptyState } from '@/components/common/EmptyState.jsx';
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

function VideoPreview({ playback, preview, filename, onRefresh }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <ErrorState
      title="Could not load video"
      description="Refresh the playback link and try again."
      onRetry={() => {
        setFailed(false);
        onRefresh();
      }}
    />
  ) : (
    <div className={styles.preview}>
      <video
        aria-label={filename}
        src={playback.url}
        poster={preview?.url}
        width={playback.width}
        height={playback.height}
        controls
        playsInline
        preload="none"
        onError={() => setFailed(true)}
      >
        Your browser does not support video playback.
      </video>
    </div>
  );
}

export function MediaDetailViewer({ media, preview, playback, original, onRefresh }) {
  return (
    <section aria-label="Media viewer" className={styles.viewer}>
      {media.type === 'VIDEO' && playback?.url ? (
        <VideoPreview
          key={playback.url}
          playback={playback}
          preview={preview}
          filename={media.originalFilename}
          onRefresh={onRefresh}
        />
      ) : preview?.url ? (
        <PreviewImage
          key={preview.url}
          preview={preview}
          filename={media.originalFilename}
          onRefresh={onRefresh}
        />
      ) : (
        <EmptyState
          title="No preview available"
          description="A display preview is not available for this media."
        />
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
          isRetrying={original.disabled}
        />
      )}
    </section>
  );
}
