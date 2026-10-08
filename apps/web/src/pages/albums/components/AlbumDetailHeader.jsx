import { Link } from 'react-router';

import { AlbumCover } from '@/features/album/index.js';

import styles from './AlbumDetail.module.css';

export function AlbumDetailHeader({ album, coverMedia }) {
  return (
    <section className={styles.header} aria-label="Album information">
      <div className={styles.cover}>
        <AlbumCover album={album} coverMedia={coverMedia} sizes="160px" />
      </div>
      <div>
        <Link to="/albums">Back to albums</Link>
        <p>{album.description}</p>
        <p>{album.visibility === 'PUBLIC' ? 'Public' : 'Private'}</p>
        <p>
          {album.counts?.media ?? 0} media · {album.counts?.images ?? 0} images ·{' '}
          {album.counts?.videos ?? 0} videos
        </p>
      </div>
    </section>
  );
}
