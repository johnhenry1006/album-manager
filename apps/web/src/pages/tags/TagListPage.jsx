import { ErrorState } from '@/components/common/ErrorState.jsx';
import { LoadingState } from '@/components/common/LoadingState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import { TagForm } from './components/TagForm.jsx';
import { TagList } from './components/TagList.jsx';
import { useTagListPage } from './hooks/useTagListPage.js';

export function TagListPage() {
  const { tags, items, pagination, page, setPage, editor } = useTagListPage();
  const busy = editor.isPending || tags.isFetching;
  return (
    <PageContainer title="Tags" description="Create and manage labels for your media.">
      <button type="button" disabled={editor.isPending} onClick={() => editor.openEditor()}>
        Create tag
      </button>
      <TagForm editor={editor} />
      {tags.isPending && <LoadingState label="Loading tags…" />}
      {!tags.isPending && tags.isFetching && <Spinner label="Refreshing tags…" />}
      {tags.isError && (
        <ErrorState
          title="Could not load tags"
          description={tags.error.message}
          onRetry={tags.refetch}
          isRetrying={tags.isFetching}
        />
      )}
      {!tags.isPending && (!tags.isError || items.length > 0) && (
        <TagList
          tags={items}
          onEdit={editor.openEditor}
          onDelete={editor.requestDelete}
          disabled={editor.isPending}
        />
      )}
      {pagination && pagination.totalPages > 0 && (
        <nav aria-label="Tag pagination">
          <button type="button" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>
            Previous page
          </button>{' '}
          <span>
            Page {page} of {pagination.totalPages}
          </span>{' '}
          <button
            type="button"
            disabled={busy || page >= pagination.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next page
          </button>
        </nav>
      )}
    </PageContainer>
  );
}
