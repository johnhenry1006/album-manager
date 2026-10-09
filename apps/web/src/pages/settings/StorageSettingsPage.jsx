import { ErrorState } from '@/components/common/ErrorState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import { StorageUsageCard } from './components/StorageUsageCard.jsx';
import { useStorageSettingsPage } from './hooks/useStorageSettingsPage.js';

export function StorageSettingsPage() {
  const page = useStorageSettingsPage();
  return (
    <PageContainer title="Storage" description="Storage usage for your media library.">
      {page.isLoading && <Spinner label="Loading storage settings" />}
      {page.error && (
        <ErrorState
          title="Could not load storage settings"
          description={page.error.message}
          onRetry={page.isRefreshing ? undefined : page.refresh}
        />
      )}
      {page.storage && (
        <>
          <button type="button" disabled={page.isRefreshing} onClick={page.refresh}>
            {page.isRefreshing ? 'Refreshing…' : 'Refresh storage'}
          </button>
          <StorageUsageCard storage={page.storage} />
        </>
      )}
    </PageContainer>
  );
}
