import { useId } from 'react';

import { ConfirmDialog } from '@/components/common/ConfirmDialog.jsx';

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
      <ConfirmDialog
        {...actions.removalConfirmation}
        title={`Remove ${actions.removalConfirmation.count} selected media from this album?`}
        description="Media files will remain in your library."
        confirmLabel="Confirm removal"
        pendingLabel="Removing…"
      />
      <div className={styles.actions}>
        <span>{selection.selectedCount} selected</span>
        <button type="button" disabled={actions.selectionLocked} onClick={selectLoaded}>
          Select loaded media
        </button>
        <button
          type="button"
          disabled={actions.selectionLocked || !selection.selectedCount}
          onClick={selection.clearSelection}
        >
          Clear selection
        </button>
        <button
          type="button"
          disabled={actions.selectionLocked || !selection.selectedCount}
          onClick={actions.removeSelected}
        >
          Remove selected from album
        </button>
        <button
          type="button"
          disabled={actions.selectionLocked || !selection.selectedCount}
          onClick={actions.favoriteSelected}
        >
          Favorite selected
        </button>
        <button
          type="button"
          disabled={actions.selectionLocked || selection.selectedCount !== 1}
          onClick={actions.setCover}
        >
          Set selected as cover
        </button>
        <button
          type="button"
          disabled={actions.selectionLocked || !hasCover}
          onClick={actions.clearCover}
        >
          Clear cover
        </button>
        <button type="button" disabled={actions.selectionLocked} onClick={openPicker}>
          Add media
        </button>
      </div>
    </section>
  );
}
