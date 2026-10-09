import { useState } from 'react';
import { Outlet } from 'react-router';

import { MainHeader } from '@/components/layout/MainHeader.jsx';
import { MainSidebar } from '@/components/layout/MainSidebar.jsx';
import { useAuth } from '@/features/auth/index.js';

import { MAIN_NAVIGATION } from '../router/navigation.js';
import styles from './AppLayout.module.css';

export function AppLayout() {
  const auth = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function logout() {
    setPending(true);
    setError(null);
    try {
      await auth.logout();
    } catch {
      setError('Sign out failed. Try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <MainSidebar items={MAIN_NAVIGATION} />
      <div className={styles.content}>
        <MainHeader />
        <div className={styles.account}>
          <span>{auth.user?.email}</span>
          <button onClick={logout} disabled={pending}>
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
