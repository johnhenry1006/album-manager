import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { uploadApi } from '../api/uploadApi.js';
import { isUploadTerminal, uploadQueryKeys } from '../utils/upload.utils.js';
import { uploadFileMetadata } from '../utils/validateUploadFile.js';

/** Register every batch file before completing any of them; the API closes registration at processing. */
export function useUploadSession({
  sessionId: suppliedId,
  enabled = true,
  pollInterval = 1000,
  policy,
} = {}) {
  const client = useQueryClient();
  const createdId = useRef(null);
  const createSession = useMutation({
    mutationFn: (options) => uploadApi.createSession(options),
    onSuccess: (session) => {
      createdId.current = session.sessionId;
    },
  });
  const sessionId = suppliedId ?? createSession.data?.sessionId;
  const session = useQuery({
    queryKey: uploadQueryKeys.session(sessionId),
    queryFn: ({ signal }) => uploadApi.getSession(sessionId, { signal }),
    enabled: enabled && Boolean(sessionId),
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      return !query.state.error &&
        data?.files.some(
          ({ status }) => !isUploadTerminal(status) && status !== 'DUPLICATE_PENDING',
        )
        ? Math.max(1, pollInterval)
        : false;
    },
  });
  const registerFile = useMutation({
    mutationFn: ({ file, sessionId: id = suppliedId ?? createdId.current, signal }) => {
      if (!id) throw new TypeError('Create an upload session before registering a file.');
      return uploadApi.registerFile(id, uploadFileMetadata(file, policy), { signal });
    },
    onSuccess: (data) =>
      client.invalidateQueries({ queryKey: uploadQueryKeys.session(data.sessionId) }),
  });
  return { ...session, sessionId, files: session.data?.files ?? [], createSession, registerFile };
}
