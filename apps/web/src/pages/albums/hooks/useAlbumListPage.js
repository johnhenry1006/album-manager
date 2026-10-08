import { useEffect, useState } from 'react';

import { useAlbums, useCreateAlbum } from '@/features/album/index.js';

import { useAlbumListFilters } from './useAlbumListFilters.js';

const EMPTY_DRAFT = { name: '', description: '', visibility: 'PRIVATE' };

export function useAlbumListPage() {
  const state = useAlbumListFilters();
  const albums = useAlbums(state.apiFilters, { enabled: !state.isSearchPending });
  const create = useCreateAlbum();
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [pageSizeCap, setPageSizeCap] = useState(48);
  const pagination = albums.data?.pagination;
  const effectiveLimit = Math.min(pagination?.limit ?? state.filters.limit, pageSizeCap);
  const pageSizes = [...new Set([12, 24, 48, effectiveLimit, pageSizeCap])]
    .filter((limit) => limit <= pageSizeCap)
    .sort((a, b) => a - b);
  useEffect(() => {
    if (pagination && pagination.limit < state.apiFilters.limit) {
      setPageSizeCap((current) => Math.min(current, pagination.limit));
    }
  }, [pagination, state.apiFilters.limit]);
  const { setFilter } = state;
  // Counts can shrink after a refetch; return an out-of-range URL to its last live page.
  useEffect(() => {
    if (
      albums.isSuccess &&
      !state.isSearchPending &&
      pagination &&
      state.filters.page > Math.max(1, pagination.totalPages)
    ) {
      setFilter('page', Math.max(1, pagination.totalPages));
    }
  }, [albums.isSuccess, state.isSearchPending, state.filters.page, pagination, setFilter]);

  function openCreate() {
    setNotice('');
    setFormError('');
    create.reset();
    setIsCreating(true);
  }
  function cancelCreate() {
    if (create.isPending) return;
    setIsCreating(false);
    setDraft(EMPTY_DRAFT);
    setFormError('');
    create.reset();
  }
  function setDraftField(name, value) {
    setDraft((current) => ({ ...current, [name]: value }));
    setFormError('');
  }
  async function submitCreate(event) {
    event.preventDefault();
    if (create.isPending) return;
    const name = draft.name.trim();
    if (!name || name.length > 255 || /[\r\n\0]/.test(name)) {
      setFormError('Enter an album name between 1 and 255 characters.');
      return;
    }
    if (draft.description.length > 5000 || /\0/.test(draft.description)) {
      setFormError('Description must contain at most 5000 characters and no NUL characters.');
      return;
    }
    try {
      await create.mutateAsync({
        name,
        description: draft.description.trim() || null,
        visibility: draft.visibility,
      });
      setIsCreating(false);
      setDraft(EMPTY_DRAFT);
      setFormError('');
      setNotice('Album created.');
      state.resetFilters();
    } catch {
      // The feature mutation exposes the centralized API error; preserve the draft for retry.
    }
  }
  return {
    ...state,
    filters: { ...state.filters, limit: effectiveLimit },
    pageSizes,
    albums,
    items: albums.data?.items ?? [],
    pagination,
    notice,
    createProps: {
      isCreating,
      draft,
      setDraftField,
      openCreate,
      cancelCreate,
      submitCreate,
      isPending: create.isPending,
      error: formError || create.error?.message,
    },
  };
}
