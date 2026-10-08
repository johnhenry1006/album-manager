import { useParams } from 'react-router';

import { ErrorState } from '@/components/common/ErrorState.jsx';
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
      {page.album.isPending && <Spinner label="Loading album" />}
      {page.album.isError && (
        <ErrorState
          title="Could not load album"
          description={page.album.error.message}
          onRetry={page.album.refetch}
        />
      )}
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
          {page.actions.isBusy && <p role="status">Updating media…</p>}
          {page.actions.notice && <p role="status">{page.actions.notice}</p>}
          {page.actions.error && <p role="alert">{page.actions.error}</p>}
          <AlbumMediaPicker picker={page.pickerProps} />
          {page.isSearchPending && <p role="status">Searching album media…</p>}
          {page.media.isError && (
            <ErrorState
              title="Could not load album media"
              description={page.media.error.message}
              onRetry={page.retryMedia}
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
