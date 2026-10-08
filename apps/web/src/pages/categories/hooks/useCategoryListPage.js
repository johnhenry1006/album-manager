import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/features/category/index.js';
import { useMutationEditor } from '@/hooks/useMutationEditor.js';

function parentOptions(items, excludedId) {
  const options = [];
  const pending = items.toReversed().map((item) => ({ item, depth: 0 }));
  while (pending.length) {
    const { item, depth } = pending.pop();
    if (item.id === excludedId) continue;
    options.push({ id: item.id, label: `${'— '.repeat(Math.min(depth, 8))}${item.name}` });
    for (let index = (item.children?.length ?? 0) - 1; index >= 0; index--) {
      pending.push({ item: item.children[index], depth: depth + 1 });
    }
  }
  return options;
}

export function useCategoryListPage() {
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
  const items = categories.data?.items ?? [];
  return {
    categories,
    items,
    editor,
    parentOptions: editor.draft ? parentOptions(items, editor.editingId) : [],
  };
}
