import { useEffect, useState } from 'react';

import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/features/tag/index.js';
import { useMutationEditor } from '@/hooks/useMutationEditor.js';

export function useTagListPage() {
  const [page, setPage] = useState(1);
  const tags = useTags({ page, limit: 50 });
  const create = useCreateTag();
  const update = useUpdateTag();
  const deletion = useDeleteTag();
  const editor = useMutationEditor({
    emptyDraft: { name: '', slug: '' },
    async save(draft, id) {
      const metadata = { name: draft.name, ...(draft.slug ? { slug: draft.slug } : {}) };
      if (id) await update.mutateAsync({ id, ...metadata });
      else {
        await create.mutateAsync(metadata);
        setPage(1);
      }
      return id ? 'Tag updated.' : 'Tag created.';
    },
    async remove(id) {
      await deletion.mutateAsync(id);
      return 'Tag deleted.';
    },
  });
  const pagination = tags.data?.pagination;
  useEffect(() => {
    if (tags.isSuccess && pagination && page > Math.max(1, pagination.totalPages)) {
      setPage(Math.max(1, pagination.totalPages));
    }
  }, [tags.isSuccess, pagination, page]);
  return { tags, items: tags.data?.items ?? [], pagination, page, setPage, editor };
}
