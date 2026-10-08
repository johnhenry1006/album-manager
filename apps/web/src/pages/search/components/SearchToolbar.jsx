export function SearchToolbar({ loadedCount, selectedCount, onSelectLoaded, onClearSelection }) {
  return (
    <section aria-label="Search result actions">
      <p>
        {loadedCount} results loaded · {selectedCount} selected
      </p>
      <button type="button" disabled={!loadedCount} onClick={onSelectLoaded}>
        Select loaded
      </button>{' '}
      <button type="button" disabled={!selectedCount} onClick={onClearSelection}>
        Clear selection
      </button>
    </section>
  );
}
