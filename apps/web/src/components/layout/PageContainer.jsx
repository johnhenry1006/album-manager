import styles from './PageContainer.module.css';

export function PageContainer({ title, description, children }) {
  return (
    <div className={styles.container}>
      <h1>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </div>
  );
}
