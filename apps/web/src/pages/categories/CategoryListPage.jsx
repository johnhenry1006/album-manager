import { ErrorState } from '@/components/common/ErrorState.jsx';
import { LoadingState } from '@/components/common/LoadingState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import { CategoryForm } from './components/CategoryForm.jsx';
import { CategoryTree } from './components/CategoryTree.jsx';
import { useCategoryListPage } from './hooks/useCategoryListPage.js';

export function CategoryListPage() {
  const { categories, items, editor, parentOptions, page, setPage, totalPages } =
    useCategoryListPage();
  const busy = editor.isPending || categories.isFetching;
  return (
    <PageContainer title="Categories" description="Organize media with a category hierarchy.">
      <button
        type="button"
        disabled={busy || categories.isPending || categories.isError}
        onClick={() => editor.openEditor()}
      >
        Create category
      </button>
      <CategoryForm editor={editor} parentOptions={parentOptions} />
      {categories.isPending && <LoadingState label="Loading categories…" />}
      {!categories.isPending && categories.isFetching && <Spinner label="Refreshing categories…" />}
      {categories.isError && (
        <ErrorState
          title="Could not load categories"
          description={categories.error.message}
          onRetry={categories.refetch}
          isRetrying={categories.isFetching}
        />
      )}
      {totalPages > 1 && (
        <nav aria-label="Category pagination">
          <button type="button" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>
            Previous page
          </button>{' '}
          <span>
            Page {page} of {totalPages}
          </span>{' '}
          <button
            type="button"
            disabled={busy || page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next page
          </button>
        </nav>
      )}
      {!categories.isPending && (!categories.isError || items.length > 0) && (
        <CategoryTree
          categories={items}
          onEdit={editor.openEditor}
          onDelete={editor.requestDelete}
          disabled={busy}
        />
      )}
    </PageContainer>
  );
}
