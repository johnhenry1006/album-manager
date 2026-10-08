import { Link } from 'react-router';

import { AlbumCover } from '@/features/album/index.js';

import styles from './AlbumList.module.css';

export function AlbumCard({ album, view }) {
  return (
    <li className={styles.card}>
      <Link
        className={styles.cardLink}
        to={`/albums/${encodeURIComponent(album.id)}`}
        aria-label={`Open album ${album.name}`}
      >
        <div className={styles.cover}>
          <AlbumCover
            album={album}
            aspectRatio={view === 'list' ? 1 : 4 / 3}
            sizes={view === 'list' ? '96px' : '(max-width: 600px) 100vw, 280px'}
          />
        </div>
        <div className={styles.metadata}>
          <h2>{album.name}</h2>
          {album.description && <p className={styles.description}>{album.description}</p>}
          <p className={styles.details}>
            <span>{album.visibility === 'PUBLIC' ? 'Public' : 'Private'}</span>
            <time dateTime={album.createdAt}>{new Date(album.createdAt).toLocaleDateString()}</time>
          </p>
        </div>
      </Link>
    </li>
  );
}
