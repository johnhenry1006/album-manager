import { Link } from 'react-router';

import { EmptyState } from '@/components/common/EmptyState.jsx';
import { AlbumCover } from '@/features/album/index.js';

import styles from './Dashboard.module.css';

export function RecentAlbums({ albums }) {
  return (
    <section className={styles.panel} aria-labelledby="recent-albums-title">
      <div className={styles.sectionHeader}>
        <h2 id="recent-albums-title">Recent albums</h2>
        <Link to="/albums">View all albums</Link>
      </div>
      {albums.length === 0 ? (
        <EmptyState title="No albums yet" description="Create an album to organize your media." />
      ) : (
        <ul className={styles.recentList}>
          {albums.map((album) => (
            <li key={album.id}>
              <Link
                className={styles.recentLink}
                to={`/albums/${encodeURIComponent(album.id)}`}
                aria-label={`Open album ${album.name}`}
              >
                <AlbumCover
                  album={album}
                  coverMedia={album.coverMedia}
                  sizes="72px"
                  className={styles.thumbnail}
                />
                <div className={styles.metadata}>
                  <h3>{album.name}</h3>
                  <p>{album.visibility === 'PUBLIC' ? 'Public' : 'Private'}</p>
                  <time dateTime={album.createdAt}>
                    {new Date(album.createdAt).toLocaleDateString()}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
