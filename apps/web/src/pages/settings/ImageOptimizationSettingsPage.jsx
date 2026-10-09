import { ErrorState } from '@/components/common/ErrorState.jsx';
import { PageContainer } from '@/components/layout/PageContainer.jsx';

import { ImageOptimizationForm } from './components/ImageOptimizationForm.jsx';
import { useImageOptimizationSettingsPage } from './hooks/useImageOptimizationSettingsPage.js';

export function ImageOptimizationSettingsPage() {
  const { settings, form } = useImageOptimizationSettingsPage();
  return (
    <PageContainer
      title="Image optimization"
      description="Choose how new images are optimized for display."
    >
      {settings.isPending && <p role="status">Loading image optimization settings…</p>}
      {settings.isError && (
        <ErrorState
          title="Could not load image optimization settings"
          description={settings.error.message}
          onRetry={settings.refetch}
        />
      )}
      {form.draft && <ImageOptimizationForm form={form} />}
    </PageContainer>
  );
}
