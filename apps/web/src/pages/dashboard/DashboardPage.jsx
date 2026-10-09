import { ErrorState } from '@/components/common/ErrorState.jsx';
import { LoadingState } from '@/components/common/LoadingState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import styles from './components/Dashboard.module.css';
import { DashboardStats } from './components/DashboardStats.jsx';
import { RecentAlbums } from './components/RecentAlbums.jsx';
import { RecentMedia } from './components/RecentMedia.jsx';
import { StorageSummary } from './components/StorageSummary.jsx';
import { useDashboardPage } from './hooks/useDashboardPage.js';

export function DashboardPage() {
  const page = useDashboardPage();
  return (
    <PageContainer title="Dashboard" description="An overview of your media library.">
      {page.isLoading && <LoadingState label="Loading dashboard" />}
      {page.error && (
        <ErrorState
          title="Could not load dashboard"
          description={page.error.message}
          onRetry={page.refresh}
          isRetrying={page.isRefreshing}
        />
      )}
      {!page.isLoading && page.isRefreshing && <Spinner label="Refreshing dashboard…" />}
      {page.hasSummary && (
        <>
          <div className={styles.toolbar}>
            {page.summaryUpdatedAt && (
              <p>
                Updated{' '}
                <time dateTime={page.summaryUpdatedAt}>
                  {new Date(page.summaryUpdatedAt).toLocaleString()}
                </time>
              </p>
            )}
            <button type="button" disabled={page.isRefreshing} onClick={page.refresh}>
              {page.isRefreshing ? 'Refreshing…' : 'Refresh dashboard'}
            </button>
          </div>
          <DashboardStats counts={page.counts} />
          <StorageSummary storage={page.storage} />
          <div className={styles.recentSections}>
            <RecentAlbums albums={page.recentAlbums} />
            <RecentMedia media={page.recentMedia} />
          </div>
        </>
      )}
    </PageContainer>
  );
}
