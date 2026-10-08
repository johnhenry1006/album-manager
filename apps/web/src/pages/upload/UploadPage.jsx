import { PageContainer } from '@/components/layout/PageContainer.jsx';

import { UploadDropzone } from './components/UploadDropzone.jsx';
import { UploadQueue } from './components/UploadQueue.jsx';
import { UploadSettings } from './components/UploadSettings.jsx';
import { useUploadPage } from './hooks/useUploadPage.js';
import styles from './UploadPage.module.css';

export function UploadPage() {
  const page = useUploadPage();
  return (
    <PageContainer
      title="Upload"
      description="Add photos and videos, then choose where they belong."
    >
      <UploadDropzone accept={page.accept} onFiles={page.queue.addFiles} />
      <div className={styles.layout}>
        <UploadQueue queue={page.queue} />
        <UploadSettings options={page.options} disabled={page.queue.isBusy} />
      </div>
    </PageContainer>
  );
}
