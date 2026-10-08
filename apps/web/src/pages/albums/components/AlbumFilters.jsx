import { useId } from 'react';

import styles from './AlbumList.module.css';

export function AlbumFilters({ filters, setFilter, resetFilters, pageSizes }) {
  const id = useId();
  return (
    <div className={styles.filters} role="search" aria-label="Album filters">
      <label className={styles.field} htmlFor={`${id}-q`}>
        Search albums
        <input
          id={`${id}-q`}
          type="search"
          maxLength={255}
          value={filters.q}
          onChange={(event) => setFilter('q', event.target.value)}
        />
      </label>
      <label className={styles.field} htmlFor={`${id}-visibility`}>
        Visibility
        <select
          id={`${id}-visibility`}
          value={filters.visibility}
          onChange={(event) => setFilter('visibility', event.target.value)}
        >
          <option value="">All visibility</option>
          <option value="PRIVATE">Private</option>
          <option value="PUBLIC">Public</option>
        </select>
      </label>
      <label className={styles.field} htmlFor={`${id}-sort`}>
        Sort
        <select
          id={`${id}-sort`}
          value={filters.sort}
          onChange={(event) => setFilter('sort', event.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </label>
      <label className={styles.field} htmlFor={`${id}-view`}>
        View
        <select
          id={`${id}-view`}
          value={filters.view}
          onChange={(event) => setFilter('view', event.target.value)}
        >
          <option value="grid">Grid</option>
          <option value="list">List</option>
        </select>
      </label>
      <label className={styles.field} htmlFor={`${id}-limit`}>
        Albums per page
        <select
          id={`${id}-limit`}
          value={filters.limit}
          onChange={(event) => setFilter('limit', event.target.value)}
        >
          {pageSizes.map((limit) => (
            <option key={limit} value={limit}>
              {limit}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={resetFilters}>
        Clear filters
      </button>
    </div>
  );
}
