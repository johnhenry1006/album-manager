import { useId, useState } from 'react';

import { useAlbum } from '../hooks/useAlbum.js';
import { useAlbums } from '../hooks/useAlbums.js';

/** Controlled single selection. onChange receives the ID (empty string clears selection). */
export function AlbumPicker({
  value = '',
  onChange,
  label = 'Album',
  disabled = false,
  limit,
  className = '',
}) {
  const id = useId();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const albums = useAlbums({ page, limit, q: search.trim() || undefined }, { enabled: !disabled });
  const options = albums.data?.items ?? [];
  const onPage = options.some((album) => album.id === value);
  const selected = useAlbum(value, { enabled: !disabled && Boolean(value) && !onPage });
  const pagination = albums.data?.pagination;
  return (
    <div className={className}>
      <label htmlFor={`${id}-search`}>Search albums</label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        disabled={disabled}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled || albums.isPending}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">Select an album</option>
        {value && !onPage && (
          <option value={value}>{selected.data?.name || 'Selected album'}</option>
        )}
        {options.map((album) => (
          <option key={album.id} value={album.id}>
            {album.name}
          </option>
        ))}
      </select>
      {albums.isFetching && <p role="status">Loading albums…</p>}
      {albums.isError && <p role="alert">{albums.error.message}</p>}
      {selected.isError && <p role="alert">{selected.error.message}</p>}
      {albums.isSuccess && options.length === 0 && <p>No albums found.</p>}
      <button
        type="button"
        disabled={disabled || albums.isFetching || page <= 1}
        onClick={() => setPage((current) => current - 1)}
      >
        Previous albums
      </button>
      <button
        type="button"
        disabled={disabled || albums.isFetching || !pagination || page >= pagination.totalPages}
        onClick={() => setPage((current) => current + 1)}
      >
        Next albums
      </button>
    </div>
  );
}
