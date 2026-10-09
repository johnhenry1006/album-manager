import { Link } from 'react-router';

import styles from './Dashboard.module.css';

const stats = [
  { key: 'media', label: 'Media', to: '/media' },
  { key: 'albums', label: 'Albums', to: '/albums' },
  { key: 'categories', label: 'Categories', to: '/categories' },
  { key: 'tags', label: 'Tags', to: '/tags' },
  { key: 'processingMedia', label: 'Processing' },
  { key: 'failedMedia', label: 'Failed' },
];

export function DashboardStats({ counts }) {
  return (
    <section aria-label="Library statistics">
      <dl className={styles.stats}>
        {stats.map(({ key, label, to }) => (
          <div className={styles.stat} key={key}>
            <dt>{to ? <Link to={to}>{label}</Link> : label}</dt>
            <dd>{counts?.[key]?.toLocaleString() ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
