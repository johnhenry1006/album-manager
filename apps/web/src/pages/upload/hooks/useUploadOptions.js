import { useState } from 'react';

import { useAlbums } from '@/features/album/index.js';
import { useCategories } from '@/features/category/index.js';
import { useTags } from '@/features/tag/index.js';

export function useUploadOptions() {
  const [selection, setSelection] = useState({
    albumId: '',
    albumName: '',
    categoryIds: [],
    tagIds: [],
  });
  const [filters, setFilters] = useState({
    albums: { page: 1, q: '' },
    categories: { page: 1, q: '' },
    tags: { page: 1, q: '' },
  });
  const albums = useAlbums({ ...filters.albums, limit: 25 });
  const categories = useCategories({ ...filters.categories, limit: 25 });
  const tags = useTags({ ...filters.tags, limit: 25 });
  const list = (name, query) => ({
    items: query.data?.items ?? [],
    page: filters[name].page,
    totalPages: query.data?.pagination?.totalPages ?? 1,
    search: filters[name].q,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    retry: query.refetch,
    setPage: (page) =>
      setFilters((current) => ({ ...current, [name]: { ...current[name], page } })),
    setSearch: (q) => setFilters((current) => ({ ...current, [name]: { page: 1, q } })),
  });
  const toggle = (key, id) =>
    setSelection((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((value) => value !== id)
        : [...current[key], id],
    }));
  return {
    selection,
    albums: list('albums', albums),
    categories: list('categories', categories),
    tags: list('tags', tags),
    setAlbum: (albumId) =>
      setSelection((current) => ({
        ...current,
        albumId,
        albumName: albums.data?.items.find((album) => album.id === albumId)?.name ?? '',
      })),
    toggleCategory: (id) => toggle('categoryIds', id),
    toggleTag: (id) => toggle('tagIds', id),
    clearCategories: () => setSelection((current) => ({ ...current, categoryIds: [] })),
    clearTags: () => setSelection((current) => ({ ...current, tagIds: [] })),
  };
}
