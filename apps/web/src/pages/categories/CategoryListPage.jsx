import { ErrorState } from '@/components/common/ErrorState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';

import { CategoryForm } from './components/CategoryForm.jsx';
import { CategoryTree } from './components/CategoryTree.jsx';
import { useCategoryListPage } from './hooks/useCategoryListPage.js';

export function CategoryListPage() {
  const { categories, items, editor, parentOptions, page, setPage, totalPages } =
    useCategoryListPage();
  return (
    <PageContainer title="Categories" description="Organize media with a category hierarchy.">
      <button
        type="button"
        disabled={editor.isPending || categories.isPending || categories.isError}
        onClick={() => editor.openEditor()}
      >
        Create category
      </button>
      <CategoryForm editor={editor} parentOptions={parentOptions} />
      {categories.isPending && <p role="status">Loading categories…</p>}
      {categories.isError && (
        <ErrorState
          title="Could not load categories"
          description={categories.error.message}
          onRetry={categories.refetch}
        />
      )}
      {totalPages > 1 && (
        <nav aria-label="Category pagination">
          <button
            type="button"
            disabled={editor.isPending || page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous page
          </button>{' '}
          <span>
            Page {page} of {totalPages}
          </span>{' '}
          <button
            type="button"
            disabled={editor.isPending || page >= totalPages}
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
          disabled={editor.isPending}
        />
      )}
    </PageContainer>
  );
}
