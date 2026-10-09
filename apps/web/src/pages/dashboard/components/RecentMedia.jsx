import { Link } from 'react-router';

import { EmptyState } from '@/components/common/EmptyState.jsx';
import { ResponsiveImage } from '@/components/media/ResponsiveImage.jsx';

import styles from './Dashboard.module.css';

const statuses = { PENDING: 'Pending', PROCESSING: 'Processing', READY: 'Ready', FAILED: 'Failed' };

export function RecentMedia({ media }) {
  return (
    <section className={styles.panel} aria-labelledby="recent-media-title">
      <div className={styles.sectionHeader}>
        <h2 id="recent-media-title">Recently uploaded media</h2>
        <Link to="/media">View all media</Link>
      </div>
      {media.length === 0 ? (
        <EmptyState
          title="No media yet"
          description="Upload media to start your library."
          action={<Link to="/upload">Upload media</Link>}
        />
      ) : (
        <ul className={styles.recentList}>
          {media.map((item) => (
            <li key={item.id}>
              <Link
                className={styles.recentLink}
                to={`/media/${encodeURIComponent(item.id)}`}
                aria-label={`Open media ${item.originalFilename}`}
              >
                <ResponsiveImage
                  thumbnails={item.thumbnails}
                  alt={item.originalFilename}
                  aspectRatio={1}
                  sizes="72px"
                  className={styles.thumbnail}
                />
                <div className={styles.metadata}>
                  <h3>{item.originalFilename}</h3>
                  <p>{statuses[item.status] ?? item.status}</p>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleDateString()}
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
