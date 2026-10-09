import { ErrorState } from '@/components/common/ErrorState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import { AlbumFilters } from './components/AlbumFilters.jsx';
import { AlbumGrid } from './components/AlbumGrid.jsx';
import styles from './components/AlbumList.module.css';
import { AlbumListHeader } from './components/AlbumListHeader.jsx';
import { useAlbumListPage } from './hooks/useAlbumListPage.js';

export function AlbumListPage() {
  const page = useAlbumListPage();
  const busy = page.albums.isFetching || page.isSearchPending;
  return (
    <PageContainer title="Albums" description="Browse and organize your media collections.">
      <AlbumListHeader total={page.pagination?.total} create={page.createProps} />
      <AlbumFilters
        filters={page.filters}
        setFilter={page.setFilter}
        resetFilters={page.resetFilters}
        pageSizes={page.pageSizes}
      />
      {page.notice && <p role="status">{page.notice}</p>}
      {page.isSearchPending && <Spinner label="Searching albums…" />}
      {!page.albums.isPending && page.albums.isFetching && <Spinner label="Refreshing albums…" />}
      {page.albums.isError && (
        <ErrorState
          title="Could not load albums"
          description={page.albums.error.message}
          onRetry={page.albums.refetch}
          isRetrying={page.albums.isFetching}
        />
      )}
      {!page.isSearchPending && (!page.albums.isError || page.items.length > 0) && (
        <AlbumGrid
          albums={page.items}
          view={page.filters.view}
          isLoading={page.albums.isPending}
          hasFilters={Boolean(page.filters.q || page.filters.visibility)}
          resetFilters={page.resetFilters}
        />
      )}
      {page.pagination && page.pagination.totalPages > 0 && (
        <nav className={styles.pagination} aria-label="Album pagination">
          <button
            type="button"
            disabled={busy || page.filters.page <= 1}
            onClick={() => page.setFilter('page', page.filters.page - 1)}
          >
            Previous page
          </button>
          <span>
            Page {page.filters.page} of {page.pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={busy || page.filters.page >= page.pagination.totalPages}
            onClick={() => page.setFilter('page', page.filters.page + 1)}
          >
            Next page
          </button>
        </nav>
      )}
    </PageContainer>
  );
}
