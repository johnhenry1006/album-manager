import { useParams } from 'react-router';

import { ErrorState } from '@/components/common/ErrorState.jsx';
import { LoadingState } from '@/components/common/LoadingState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';
import { VirtualMediaGrid } from '@/features/media/index.js';

import { AlbumDetailHeader } from './components/AlbumDetailHeader.jsx';
import { AlbumMediaPicker } from './components/AlbumMediaPicker.jsx';
import { AlbumToolbar } from './components/AlbumToolbar.jsx';
import { useAlbumDetailPage } from './hooks/useAlbumDetailPage.js';

function AlbumDetailContent({ albumId }) {
  const page = useAlbumDetailPage(albumId);
  return (
    <PageContainer title={page.album.data?.name || 'Album details'}>
      {page.album.isPending && <LoadingState label="Loading album" />}
      {page.album.isError && (
        <ErrorState
          title="Could not load album"
          description={page.album.error.message}
          onRetry={page.album.refetch}
          isRetrying={page.album.isFetching}
        />
      )}
      {!page.album.isPending && page.album.isFetching && <Spinner label="Refreshing album…" />}
      {page.album.data && (
        <>
          <AlbumDetailHeader album={page.album.data} coverMedia={page.coverMedia} />
          <AlbumToolbar
            filters={page.filters}
            setFilter={page.setFilter}
            resetFilters={page.resetFilters}
            selection={page.selection}
            selectLoaded={page.selectLoaded}
            actions={page.actions}
            hasCover={Boolean(page.album.data.coverMediaId)}
            openPicker={page.pickerProps.open}
          />
          {page.actions.isBusy && <Spinner label="Updating media…" />}
          {page.actions.notice && <p role="status">{page.actions.notice}</p>}
          {page.actions.error && !page.actions.removalConfirmation.open && (
            <ErrorState title="Could not update album media" description={page.actions.error} />
          )}
          <AlbumMediaPicker picker={page.pickerProps} />
          {page.isSearchPending && <Spinner label="Searching album media…" />}
          {page.media.isError && (
            <ErrorState
              title="Could not load album media"
              description={page.media.error.message}
              onRetry={page.retryMedia}
              isRetrying={page.media.isFetching}
            />
          )}
          {!page.isSearchPending && (!page.media.isError || page.media.items.length > 0) && (
            <VirtualMediaGrid
              {...page.gridProps}
              key={page.gridProps.paginationKey}
              label="Album media"
              emptyTitle="No album media found"
              emptyDescription="Try changing your filters or add media from your library."
            />
          )}
        </>
      )}
    </PageContainer>
  );
}

export function AlbumDetailPage() {
  const { albumId } = useParams();
  // A route change starts fresh page selection and ignores completion state from the old album.
  return <AlbumDetailContent key={albumId} albumId={albumId} />;
}
