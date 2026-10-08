import { useState } from 'react';

import { useMediaActions } from '@/features/media/index.js';
import {
  DEFAULT_UPLOAD_POLICY,
  useFileUpload,
  useUploadProgress,
} from '@/features/upload/index.js';

/** Page orchestration owns selection and any future Album/Category/Tag assignment after finalMediaId. */
export function useUploadPage() {
  const [file, setFile] = useState(null);
  const [attemptedFile, setAttemptedFile] = useState(null);
  const { refresh: refreshMedia } = useMediaActions();
  const upload = useFileUpload();
  const progress = useUploadProgress(upload);
  // Feature state reports failures; event handlers consume promise rejections, including cancellation.
  const run = async (action) => {
    try {
      const mediaId = await action();
      if (mediaId) await refreshMedia();
    } catch {
      /* Render the feature's error state. */
    }
  };
  return {
    ...upload,
    file,
    progress,
    canRetry: upload.canRetry && file === attemptedFile,
    accept: DEFAULT_UPLOAD_POLICY.supportedMimeTypes.join(','),
    setFile,
    start: () => {
      setAttemptedFile(file);
      return run(() => upload.upload(file));
    },
    retry: () => run(upload.retry),
    resolveDuplicate: (action) => run(() => upload.resolveDuplicate(action)),
  };
}
