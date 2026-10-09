import { ErrorState } from '@/components/common/ErrorState.jsx';
import { LoadingState } from '@/components/common/LoadingState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import { ImageOptimizationForm } from './components/ImageOptimizationForm.jsx';
import { useImageOptimizationSettingsPage } from './hooks/useImageOptimizationSettingsPage.js';

export function ImageOptimizationSettingsPage() {
  const { settings, form } = useImageOptimizationSettingsPage();
  return (
    <PageContainer
      title="Image optimization"
      description="Choose how new images are optimized for display."
    >
      {settings.isPending && <LoadingState label="Loading image optimization settings…" />}
      {!settings.isPending && settings.isFetching && (
        <Spinner label="Refreshing image optimization settings…" />
      )}
      {settings.isError && (
        <ErrorState
          title="Could not load image optimization settings"
          description={settings.error.message}
          onRetry={settings.refetch}
          isRetrying={settings.isFetching}
        />
      )}
      {form.draft && <ImageOptimizationForm form={form} />}
    </PageContainer>
  );
}
