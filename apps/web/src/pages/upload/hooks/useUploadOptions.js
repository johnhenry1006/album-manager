import { useState } from 'react';

import { useAlbums } from '@/features/album/index.js';
import { useCategories } from '@/features/category/index.js';
import { useTags } from '@/features/tag/index.js';
import { useDebounce } from '@/hooks/useDebounce.js';

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
  const albumSearch = useDebounce(filters.albums.q.trim());
  const categorySearch = useDebounce(filters.categories.q.trim());
  const tagSearch = useDebounce(filters.tags.q.trim());
  const albums = useAlbums(
    { ...filters.albums, q: albumSearch, limit: 25 },
    { enabled: albumSearch === filters.albums.q.trim() },
  );
  const categories = useCategories(
    { ...filters.categories, q: categorySearch, limit: 25 },
    { enabled: categorySearch === filters.categories.q.trim() },
  );
  const tags = useTags(
    { ...filters.tags, q: tagSearch, limit: 25 },
    { enabled: tagSearch === filters.tags.q.trim() },
  );
  const searches = { albums: albumSearch, categories: categorySearch, tags: tagSearch };
  const list = (name, query) => ({
    items: query.data?.items ?? [],
    page: filters[name].page,
    totalPages: query.data?.pagination?.totalPages ?? 1,
    search: filters[name].q,
    isLoading: query.isPending,
    isFetching: query.isFetching || searches[name] !== filters[name].q.trim(),
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
