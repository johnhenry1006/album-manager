import { Link } from 'react-router';

import styles from './MediaLibrary.module.css';

export function MediaLibraryHeader({ loadedCount }) {
  return (
    <div className={styles.header}>
      <p>{loadedCount} media items loaded</p>
      <Link to="/upload">Upload media</Link>
    </div>
  );
}
