import styles from './FeedbackState.module.css';

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again later.',
  onRetry,
}) {
  return (
    <div className={styles.state} role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
