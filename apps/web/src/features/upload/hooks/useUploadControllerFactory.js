import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { uploadApi } from '../api/uploadApi.js';
import { createFileUpload } from '../services/fileUpload.js';
import { uploadQueryKeys } from '../utils/upload.utils.js';

/** Keep query policy inside the feature for both single-file and multi-file consumers. */
export function useUploadControllerFactory() {
  const client = useQueryClient();
  return useMemo(
    () => () =>
      createFileUpload({
        queryFile: async (sessionId, uploadFileId, signal) => {
          const session = await client.fetchQuery({
            queryKey: [...uploadQueryKeys.session(sessionId), 'file', uploadFileId],
            queryFn: ({ signal: querySignal }) =>
              uploadApi.getSession(sessionId, {
                signal: AbortSignal.any([signal, querySignal]),
              }),
            staleTime: 0,
          });
          signal.throwIfAborted();
          return session.files.find((file) => file.uploadFileId === uploadFileId);
        },
      }),
    [client],
  );
}
