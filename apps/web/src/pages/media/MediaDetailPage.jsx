import { Link } from 'react-router';

import { ErrorState } from '@/components/common/ErrorState.jsx';
import { LoadingState } from '@/components/common/LoadingState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import styles from './components/MediaDetail.module.css';
import { MediaDetailViewer } from './components/MediaDetailViewer.jsx';
import { MediaMetadataPanel } from './components/MediaMetadataPanel.jsx';
import { useMediaDetailPage } from './hooks/useMediaDetailPage.js';

export function MediaDetailPage() {
  const page = useMediaDetailPage();
  return (
    <PageContainer title="Media details" description={page.media?.originalFilename}>
      <Link to="/media">Back to media library</Link>
      {!page.isLoading && page.isRefreshing && <Spinner label="Refreshing media details…" />}
      {page.isLoading ? (
        <LoadingState label="Loading media details" />
      ) : (
        <>
          {page.error && (
            <ErrorState
              title="Could not load media details"
              description={page.error.message}
              onRetry={page.refresh}
              isRetrying={page.isRefreshing}
            />
          )}
          {page.media && (
            <div className={styles.layout}>
              <MediaDetailViewer
                key={page.mediaId}
                media={page.media}
                preview={page.preview}
                playback={page.playback}
                original={page.actions.original}
                onRefresh={page.refresh}
              />
              <MediaMetadataPanel media={page.media} actions={page.actions} />
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
