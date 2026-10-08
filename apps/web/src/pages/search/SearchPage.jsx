import { ErrorState } from '@/components/common/ErrorState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { VirtualMediaGrid } from '@/features/media/index.js';

import { SearchForm } from './components/SearchForm.jsx';
import { SearchToolbar } from './components/SearchToolbar.jsx';
import { useSearchPage } from './hooks/useSearchPage.js';

export function SearchPage() {
  const page = useSearchPage();
  return (
    <PageContainer title="Search" description="Find media by filename and metadata.">
      <SearchForm {...page.formProps} />
      <SearchToolbar {...page.toolbarProps} />
      {page.isSearchPending && <p role="status">Searching media…</p>}
      {page.mediaError && !page.filterError && (
        <ErrorState
          title="Could not load search results"
          description={page.mediaError.message}
          onRetry={page.retryMedia}
        />
      )}
      {!page.filterError && (!page.mediaError || page.loadedCount > 0) && (
        <VirtualMediaGrid
          key={page.gridProps.paginationKey}
          {...page.gridProps}
          label="Search results"
          emptyTitle="No media found"
          emptyDescription="Try changing or clearing your search filters."
        />
      )}
    </PageContainer>
  );
}
