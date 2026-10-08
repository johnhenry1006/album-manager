import { EmptyState } from '@/components/common/EmptyState.jsx';

import { AlbumCard } from './AlbumCard.jsx';
import styles from './AlbumList.module.css';

export function AlbumGrid({ albums, view = 'grid', isLoading = false, hasFilters, resetFilters }) {
  if (isLoading) return <p role="status">Loading albums…</p>;
  if (albums.length === 0)
    return (
      <EmptyState
        title="No albums found"
        description={
          hasFilters
            ? 'Try changing your search or visibility filter.'
            : 'Create an album to start organizing your media.'
        }
        action={
          hasFilters ? (
            <button type="button" onClick={resetFilters}>
              Reset search
            </button>
          ) : undefined
        }
      />
    );
  return (
    <ul
      className={view === 'list' ? styles.list : styles.grid}
      data-view={view}
      aria-label="Albums"
    >
      {albums.map((album) => (
        <AlbumCard key={album.id} album={album} view={view} />
      ))}
    </ul>
  );
}
