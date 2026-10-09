import { useMemo, useState } from 'react';

import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/features/category/index.js';
import { useMutationEditor } from '@/hooks/useMutationEditor.js';

const EMPTY_ITEMS = [];
const PAGE_SIZE = 50;

function hierarchyRows(items, excludedId) {
  const options = [];
  const pending = items.toReversed().map((item) => ({ item, depth: 0 }));
  while (pending.length) {
    const { item, depth } = pending.pop();
    if (item.id === excludedId) continue;
    options.push({ ...item, depth });
    for (let index = (item.children?.length ?? 0) - 1; index >= 0; index--) {
      pending.push({ item: item.children[index], depth: depth + 1 });
    }
  }
  return options;
}

// Rebuild only this page's branches, preserving nested lists without rendering
// off-page descendants. Retain the real child flag for deletion eligibility.
function pageTree(rows) {
  const roots = [];
  const ancestors = [];
  for (const item of rows) {
    const node = { ...item, hasChildren: Boolean(item.children?.length), children: [] };
    while (ancestors.length && ancestors.at(-1).depth >= item.depth) ancestors.pop();
    (ancestors.at(-1)?.children ?? roots).push(node);
    ancestors.push(node);
  }
  return roots;
}

export function useCategoryListPage() {
  const [requestedPage, setPage] = useState(1);
  const categories = useCategories({ tree: true });
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const deletion = useDeleteCategory();
  const editor = useMutationEditor({
    emptyDraft: { name: '', slug: '', parentId: '' },
    async save(draft, id) {
      const metadata = {
        name: draft.name,
        parentId: draft.parentId || null,
        ...(draft.slug ? { slug: draft.slug } : {}),
      };
      if (id) await update.mutateAsync({ id, ...metadata });
      else await create.mutateAsync(metadata);
      return id ? 'Category updated.' : 'Category created.';
    },
    async remove(id) {
      await deletion.mutateAsync(id);
      return 'Category deleted.';
    },
  });
  const tree = categories.data?.items ?? EMPTY_ITEMS;
  const rows = useMemo(() => hierarchyRows(tree), [tree]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const page = Math.min(requestedPage, Math.max(1, totalPages));
  const isEditing = Boolean(editor.draft);
  const parentOptions = useMemo(
    () =>
      isEditing
        ? hierarchyRows(tree, editor.editingId).map((item) => ({
            id: item.id,
            label: `${'— '.repeat(Math.min(item.depth, 8))}${item.name}`,
          }))
        : [],
    [tree, editor.editingId, isEditing],
  );
  return {
    categories,
    items: pageTree(rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)),
    page,
    setPage,
    totalPages,
    editor,
    parentOptions,
  };
}
