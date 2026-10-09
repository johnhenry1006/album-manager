import { EmptyState } from '@/components/common/EmptyState.jsx';
import { ErrorState } from '@/components/common/ErrorState.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import styles from '../UploadPage.module.css';

function OptionList({ label, list, selected, onToggle, onClear, disabled }) {
  return (
    <fieldset disabled={disabled} className={styles.options}>
      <legend>{label}</legend>
      <label>
        Search {label.toLowerCase()}
        <input
          type="search"
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
        />
      </label>
      {list.isFetching && <Spinner label={`Loading ${label.toLowerCase()}…`} />}
      {list.error && (
        <ErrorState
          title={`${label} unavailable`}
          description={list.error.message}
          onRetry={list.retry}
          retryLabel={`Retry ${label.toLowerCase()}`}
          isRetrying={list.isFetching}
        />
      )}
      {(!list.error || list.items.length > 0) && (
        <>
          {list.items.map((item) => (
            <label key={item.id} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => onToggle(item.id)}
              />
              {item.name}
            </label>
          ))}
          {!list.isFetching && !list.error && list.items.length === 0 && (
            <EmptyState title={`No ${label.toLowerCase()} available.`} />
          )}
        </>
      )}
      <p>{selected.length} selected</p>
      <button type="button" disabled={selected.length === 0} onClick={onClear}>
        Clear {label.toLowerCase()}
      </button>
      <Pagination label={label.toLowerCase()} list={list} />
    </fieldset>
  );
}
function Pagination({ label, list }) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        disabled={list.isFetching || list.page <= 1}
        onClick={() => list.setPage(list.page - 1)}
      >
        Previous {label}
      </button>
      <span>
        Page {list.page} of {list.totalPages}
      </span>
      <button
        type="button"
        disabled={list.isFetching || list.page >= list.totalPages}
        onClick={() => list.setPage(list.page + 1)}
      >
        Next {label}
      </button>
    </div>
  );
}
export function UploadSettings({ options, disabled }) {
  const { selection, albums, categories, tags } = options;
  return (
    <section className={styles.panel} aria-label="Upload settings">
      <h2>Upload settings</h2>
      <p>Selections apply when you start queued files. Assignment retries keep those selections.</p>
      <fieldset disabled={disabled} className={styles.options}>
        <legend>Album</legend>
        <label htmlFor="upload-album-search">Search albums</label>
        <input
          id="upload-album-search"
          type="search"
          value={albums.search}
          onChange={(event) => albums.setSearch(event.target.value)}
        />
        <label htmlFor="upload-album">Album</label>
        <select
          id="upload-album"
          value={selection.albumId}
          onChange={(event) => options.setAlbum(event.target.value)}
          disabled={disabled || albums.isLoading || Boolean(albums.error)}
        >
          <option value="">No album</option>
          {selection.albumId && !albums.items.some((album) => album.id === selection.albumId) && (
            <option value={selection.albumId}>{selection.albumName || 'Selected album'}</option>
          )}
          {albums.items.map((album) => (
            <option key={album.id} value={album.id}>
              {album.name}
            </option>
          ))}
        </select>
        {albums.isFetching && <Spinner label="Loading albums…" />}
        {albums.error && (
          <ErrorState
            title="Albums unavailable"
            description={albums.error.message}
            onRetry={albums.retry}
            retryLabel="Retry albums"
            isRetrying={albums.isFetching}
          />
        )}
        {!albums.isFetching && !albums.error && albums.items.length === 0 && (
          <EmptyState title="No albums available." />
        )}
        <Pagination label="albums" list={albums} />
      </fieldset>
      <OptionList
        label="Categories"
        list={categories}
        selected={selection.categoryIds}
        onToggle={options.toggleCategory}
        onClear={options.clearCategories}
        disabled={disabled}
      />
      <OptionList
        label="Tags"
        list={tags}
        selected={selection.tagIds}
        onToggle={options.toggleTag}
        onClear={options.clearTags}
        disabled={disabled}
      />
    </section>
  );
}
