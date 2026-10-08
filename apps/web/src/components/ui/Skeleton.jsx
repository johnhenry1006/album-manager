import styles from './Skeleton.module.css';

export function Skeleton({ className = '' }) {
  return <div className={`${styles.skeleton} ${className}`} aria-hidden="true" />;
}
