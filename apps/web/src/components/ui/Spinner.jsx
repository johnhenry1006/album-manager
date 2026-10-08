import styles from './Spinner.module.css';

export function Spinner({ label = 'Loading' }) {
  return (
    <span className={styles.wrapper} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
