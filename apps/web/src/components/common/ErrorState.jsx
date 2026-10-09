import styles from './FeedbackState.module.css';

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again later.',
  onRetry,
  isRetrying = false,
  retryLabel = 'Try again',
}) {
  return (
    <div className={styles.state} role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && (
        <button type="button" disabled={isRetrying} onClick={onRetry}>
          {isRetrying ? 'Trying again…' : retryLabel}
        </button>
      )}
    </div>
  );
}
