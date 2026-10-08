import { Outlet } from 'react-router';

import { MainHeader } from '@/components/layout/MainHeader.jsx';
import { MainSidebar } from '@/components/layout/MainSidebar.jsx';

import { MAIN_NAVIGATION } from '../router/navigation.js';
import styles from './AppLayout.module.css';

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <MainSidebar items={MAIN_NAVIGATION} />
      <div className={styles.content}>
        <MainHeader />
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
