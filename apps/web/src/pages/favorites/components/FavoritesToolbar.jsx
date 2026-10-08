export function FavoritesToolbar({
  loadedCount,
  selectedCount,
  isBusy,
  onSelectLoaded,
  onClearSelection,
  onRemoveSelected,
}) {
  return (
    <section aria-label="Favorites actions" aria-busy={isBusy}>
      <p>
        {loadedCount} favorites loaded · {selectedCount} selected
      </p>
      <button type="button" disabled={isBusy || !loadedCount} onClick={onSelectLoaded}>
        Select loaded
      </button>{' '}
      <button type="button" disabled={isBusy || !selectedCount} onClick={onClearSelection}>
        Clear selection
      </button>{' '}
      <button type="button" disabled={isBusy || !selectedCount} onClick={onRemoveSelected}>
        {isBusy ? 'Removing…' : 'Remove from favorites'}
      </button>
    </section>
  );
}
