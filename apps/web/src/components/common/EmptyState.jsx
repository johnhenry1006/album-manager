import styles from './FeedbackState.module.css';

export function EmptyState({ title = 'Nothing here yet', description, action }) {
  return (
    <div className={styles.state}>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
