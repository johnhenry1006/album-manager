import { useId } from 'react';

import styles from './AlbumDetail.module.css';

export function AlbumToolbar({
  filters,
  setFilter,
  resetFilters,
  selection,
  selectLoaded,
  actions,
  hasCover,
  openPicker,
}) {
  const id = useId();
  return (
    <section aria-label="Album media controls">
      <div className={styles.filters}>
        <label>
          Search album media
          <input
            id={`${id}-q`}
            type="search"
            maxLength={255}
            value={filters.q}
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </label>
        <label>
          Type
          <select value={filters.type} onChange={(event) => setFilter('type', event.target.value)}>
            <option value="">All media</option>
            <option value="IMAGE">Images</option>
            <option value="VIDEO">Videos</option>
          </select>
        </label>
        <label>
          Favorite
          <select
            value={filters.favorite}
            onChange={(event) => setFilter('favorite', event.target.value)}
          >
            <option value="">All favorites</option>
            <option value="true">Favorites</option>
            <option value="false">Not favorites</option>
          </select>
        </label>
        <button type="button" onClick={resetFilters}>
          Clear filters
        </button>
      </div>
      <div className={styles.actions}>
        <span>{selection.selectedCount} selected</span>
        <button type="button" disabled={actions.isBusy} onClick={selectLoaded}>
          Select loaded media
        </button>
        <button
          type="button"
          disabled={actions.isBusy || !selection.selectedCount}
          onClick={selection.clearSelection}
        >
          Clear selection
        </button>
        <button
          type="button"
          disabled={actions.isBusy || !selection.selectedCount}
          onClick={actions.removeSelected}
        >
          Remove selected from album
        </button>
        <button
          type="button"
          disabled={actions.isBusy || !selection.selectedCount}
          onClick={actions.favoriteSelected}
        >
          Favorite selected
        </button>
        <button
          type="button"
          disabled={actions.isBusy || selection.selectedCount !== 1}
          onClick={actions.setCover}
        >
          Set selected as cover
        </button>
        <button type="button" disabled={actions.isBusy || !hasCover} onClick={actions.clearCover}>
          Clear cover
        </button>
        <button type="button" disabled={actions.isBusy} onClick={openPicker}>
          Add media
        </button>
      </div>
    </section>
  );
}
