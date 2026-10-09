import { useLoginPage } from './hooks/useLoginPage.js';
import styles from './LoginPage.module.css';
export function LoginPage() {
  const form = useLoginPage();
  return (
    <main className={styles.page}>
      <form className={styles.form} onSubmit={form.submit}>
        <h1>Sign in to Album Manager</h1>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          value={form.email}
          onChange={(event) => form.setEmail(event.target.value)}
          disabled={form.pending}
        />
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          value={form.password}
          onChange={(event) => form.setPassword(event.target.value)}
          disabled={form.pending}
        />
        {form.error && <p role="alert">{form.error}</p>}
        <button disabled={form.pending} type="submit">
          {form.pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
