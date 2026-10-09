import { ErrorState } from '@/components/common/ErrorState.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';
import { VirtualMediaGrid } from '@/features/media/index.js';

import styles from './AlbumDetail.module.css';

export function AlbumMediaPicker({ picker }) {
  if (!picker.isAdding) return null;
  return (
    <section className={styles.picker} aria-label="Add existing media">
      <h2>Add existing media</h2>
      <p>Choose media from your library. Existing album members are preserved.</p>
      <label>
        Search library media
        <input
          type="search"
          maxLength={255}
          value={picker.search}
          onChange={(event) => picker.setSearch(event.target.value)}
        />
      </label>
      {picker.error && (
        <ErrorState
          title="Could not load library media"
          description={picker.error.message}
          onRetry={picker.retry}
          isRetrying={picker.isFetching}
        />
      )}
      {picker.isSearchPending && <Spinner label="Searching library media…" />}
      {!picker.isSearchPending && (!picker.error || picker.gridProps.items.length > 0) && (
        <VirtualMediaGrid
          {...picker.gridProps}
          height={350}
          label="Library media picker"
          emptyTitle="No library media found"
        />
      )}
      <div className={styles.actions}>
        <span>{picker.selection.selectedCount} to add</span>
        <button
          type="button"
          disabled={picker.actions.isBusy || !picker.selection.selectedCount}
          onClick={picker.actions.addSelected}
        >
          Add selected media
        </button>
        <button type="button" disabled={picker.actions.isBusy} onClick={picker.close}>
          Close picker
        </button>
      </div>
    </section>
  );
}
