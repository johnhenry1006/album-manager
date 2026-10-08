import { ErrorState } from '@/components/common/ErrorState.jsx';

import styles from './MediaFilters.module.css';

function OptionFilter({ label, emptyLabel, value, onChange, source }) {
  const { query, page, setPage } = source;
  const options = query.data?.items || [];
  const missingOption = value && !options.some(({ id }) => id === value);
  return (
    <div className={styles.taxonomy}>
      <label className={styles.field}>
        {label}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={query.isPending}
        >
          <option value="">{emptyLabel}</option>
          {missingOption && (
            <option value={value}>
              Selected {label.toLowerCase()} ({value})
            </option>
          )}
          {options.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {query.isPending && <span role="status">Loading {label.toLowerCase()} options</span>}
      {query.isError && (
        <ErrorState
          title={`Could not load ${label.toLowerCase()} options`}
          description={query.error.message}
          onRetry={() => query.refetch()}
        />
      )}
      <div className={styles.optionPages}>
        <button
          type="button"
          aria-label={`Previous ${label.toLowerCase()} options`}
          disabled={page <= 1 || query.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          aria-label={`Next ${label.toLowerCase()} options`}
          disabled={query.isFetching || page >= (query.data?.pagination.totalPages || 1)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function MediaFilterForm({
  filters,
  setFilter,
  resetFilters,
  albums,
  categories,
  tags,
  dateError,
  mimeError,
}) {
  return (
    <section aria-label="Media filters" className={styles.filters}>
      <label className={styles.field}>
        Search media
        <input
          type="search"
          maxLength={255}
          value={filters.q}
          onChange={(event) => setFilter('q', event.target.value)}
          placeholder="Search filenames, categories, tags…"
        />
      </label>
      <label className={styles.field}>
        Type
        <select value={filters.type} onChange={(event) => setFilter('type', event.target.value)}>
          <option value="">All types</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
        </select>
      </label>
      {albums && (
        <OptionFilter
          label="Album"
          emptyLabel="All albums"
          value={filters.album}
          onChange={(value) => setFilter('album', value)}
          source={albums}
        />
      )}
      {Object.hasOwn(filters, 'mimeType') && (
        <label className={styles.field}>
          File type (MIME)
          <input
            type="text"
            value={filters.mimeType}
            maxLength={127}
            aria-invalid={Boolean(mimeError)}
            aria-describedby={mimeError ? 'media-mime-error' : undefined}
            placeholder="image/jpeg, video/mp4…"
            onChange={(event) => setFilter('mimeType', event.target.value)}
          />
        </label>
      )}
      <OptionFilter
        label="Category"
        emptyLabel="All categories"
        value={filters.category}
        onChange={(value) => setFilter('category', value)}
        source={categories}
      />
      <OptionFilter
        label="Tag"
        emptyLabel="All tags"
        value={filters.tag}
        onChange={(value) => setFilter('tag', value)}
        source={tags}
      />
      <label className={styles.field}>
        Capture date from (UTC)
        <input
          type="date"
          value={filters.takenAtFrom}
          aria-invalid={Boolean(dateError)}
          aria-describedby={dateError ? 'media-date-error' : undefined}
          onChange={(event) => setFilter('takenAtFrom', event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Capture date to (UTC)
        <input
          type="date"
          value={filters.takenAtTo}
          aria-invalid={Boolean(dateError)}
          aria-describedby={dateError ? 'media-date-error' : undefined}
          onChange={(event) => setFilter('takenAtTo', event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Favorite
        <select
          value={filters.favorite}
          onChange={(event) => setFilter('favorite', event.target.value)}
        >
          <option value="">All media</option>
          <option value="true">Favorites</option>
          <option value="false">Non-favorites</option>
        </select>
      </label>
      <button type="button" onClick={resetFilters}>
        Clear filters
      </button>
      {dateError && (
        <p id="media-date-error" role="alert">
          {dateError}
        </p>
      )}
      {mimeError && (
        <p id="media-mime-error" role="alert">
          {mimeError}
        </p>
      )}
    </section>
  );
}
