import { ErrorState } from '@/components/common/ErrorState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { VirtualMediaGrid } from '@/features/media/index.js';

import { TrashToolbar } from './components/TrashToolbar.jsx';
import { useTrashPage } from './hooks/useTrashPage.js';

export function TrashPage() {
  const page = useTrashPage();
  return (
    <PageContainer
      title="Trash"
      description="Restore deleted media or permanently delete their files."
    >
      <TrashToolbar {...page.toolbarProps} />
      {page.notice && <p role="status">{page.notice}</p>}
      {page.actionError && !page.toolbarProps.confirmationCount && (
        <ErrorState title="Could not update trash" description={page.actionError} />
      )}
      {page.mediaError && (
        <ErrorState
          title="Could not load trash"
          description={page.mediaError.message}
          onRetry={page.retryMedia}
          isRetrying={page.isFetchingMedia}
        />
      )}
      {(!page.mediaError || page.loadedCount > 0) && (
        <VirtualMediaGrid
          {...page.gridProps}
          label="Trash media gallery"
          emptyTitle="Trash is empty"
          emptyDescription="Deleted media will appear here."
        />
      )}
    </PageContainer>
  );
}
