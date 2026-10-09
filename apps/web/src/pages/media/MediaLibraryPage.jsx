import { ErrorState } from '@/components/common/ErrorState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';
import { VirtualMediaGrid } from '@/features/media/index.js';

import { MediaFilterBar } from './components/MediaFilterBar.jsx';
import { MediaLibraryHeader } from './components/MediaLibraryHeader.jsx';
import { useMediaLibraryPage } from './hooks/useMediaLibraryPage.js';

export function MediaLibraryPage() {
  const page = useMediaLibraryPage();
  return (
    <PageContainer title="Media" description="Browse and filter your media library.">
      <MediaLibraryHeader loadedCount={page.loadedCount} />
      <MediaFilterBar
        filters={page.filters}
        setFilter={page.setFilter}
        resetFilters={page.resetFilters}
        categories={page.categories}
        tags={page.tags}
        dateError={page.dateError}
      />
      {page.isSearchPending && <Spinner label="Searching media…" />}
      {page.mediaError && !page.dateError && (
        <ErrorState
          title="Could not load media"
          description={page.mediaError.message}
          onRetry={page.retryMedia}
          isRetrying={page.isFetchingMedia}
        />
      )}
      {!page.dateError && (!page.mediaError || page.loadedCount > 0) && (
        <VirtualMediaGrid
          key={page.gridProps.paginationKey}
          {...page.gridProps}
          emptyTitle="No media found"
          emptyDescription="Try changing your filters or upload some media."
        />
      )}
    </PageContainer>
  );
}
