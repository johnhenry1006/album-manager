import { ErrorState } from '@/components/common/ErrorState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { VirtualMediaGrid } from '@/features/media/index.js';

import { FavoritesToolbar } from './components/FavoritesToolbar.jsx';
import { useFavoritesPage } from './hooks/useFavoritesPage.js';

export function FavoritesPage() {
  const page = useFavoritesPage();
  return (
    <PageContainer title="Favorites" description="Browse and manage your favorite media.">
      <FavoritesToolbar {...page.toolbarProps} />
      {page.notice && <p role="status">{page.notice}</p>}
      {page.actionError && (
        <ErrorState title="Could not update favorites" description={page.actionError} />
      )}
      {page.mediaError && (
        <ErrorState
          title="Could not load favorites"
          description={page.mediaError.message}
          onRetry={page.retryMedia}
          isRetrying={page.isFetchingMedia}
        />
      )}
      {(!page.mediaError || page.loadedCount > 0) && (
        <VirtualMediaGrid
          {...page.gridProps}
          label="Favorite media gallery"
          emptyTitle="No favorites yet"
          emptyDescription="Mark media as favorites to see them here."
        />
      )}
    </PageContainer>
  );
}
