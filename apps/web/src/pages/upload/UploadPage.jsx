import { Link } from 'react-router';

import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import { useUploadPage } from './hooks/useUploadPage.js';
import styles from './UploadPage.module.css';

const actionLabels = { SKIP: 'Skip', USE_EXISTING: 'Use existing', KEEP_BOTH: 'Keep both' };

export function UploadPage() {
  const page = useUploadPage();
  return (
    <PageContainer title="Upload" description="Upload a photo or video to your media library.">
      <div className={styles.panel}>
        <label htmlFor="upload-file">File</label>
        <input
          id="upload-file"
          type="file"
          accept={page.accept}
          disabled={page.isActive}
          onChange={(event) => page.setFile(event.target.files?.[0] ?? null)}
        />
        <div className={styles.actions}>
          <button type="button" disabled={!page.file || page.isActive} onClick={page.start}>
            Upload file
          </button>
          {page.canRetry && (
            <button type="button" onClick={page.retry}>
              Retry
            </button>
          )}
          {page.isActive && (
            <button type="button" onClick={page.cancel}>
              Cancel
            </button>
          )}
        </div>
        {page.progress.isUploading && (
          <div role="status">
            <label htmlFor="upload-progress">
              Uploading{page.progress.percent !== null ? ` ${page.progress.percent}%` : '…'}
            </label>
            <progress id="upload-progress" max="100" value={page.progress.percent ?? undefined} />
          </div>
        )}
        {page.isProcessing && <Spinner label="Processing media…" />}
        {page.isActive &&
          !page.progress.isUploading &&
          !page.isProcessing &&
          !page.needsDuplicateResolution && (
            <Spinner
              label={page.isActiveResolution ? 'Resolving duplicate…' : 'Preparing upload…'}
            />
          )}
        {page.needsDuplicateResolution && (
          <div role="group" aria-label="Resolve duplicate">
            <p>This file matches existing media. Choose how to continue.</p>
            <div className={styles.actions}>
              {page.duplicateActions.map((action) => (
                <button key={action} type="button" onClick={() => page.resolveDuplicate(action)}>
                  {actionLabels[action]}
                </button>
              ))}
            </div>
          </div>
        )}
        {page.error && <p role="alert">{page.error.message}</p>}
        {page.status === 'CANCELLED' && <p role="status">Upload stopped.</p>}
        {page.finalMediaId && (
          <p role="status">
            Media ready. <Link to={`/media/${page.finalMediaId}`}>View media</Link>
          </p>
        )}
      </div>
    </PageContainer>
  );
}
