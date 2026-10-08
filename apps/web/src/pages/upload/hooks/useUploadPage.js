import { useAlbumMediaActions } from '@/features/album/index.js';
import { useAssignMediaCategories } from '@/features/category/index.js';
import { useMediaActions } from '@/features/media/index.js';
import { useAssignMediaTags } from '@/features/tag/index.js';
import { DEFAULT_UPLOAD_POLICY, useFileUploads } from '@/features/upload/index.js';

import { useUploadOptions } from './useUploadOptions.js';
import { useUploadQueue } from './useUploadQueue.js';

/** All cross-domain assignment runs here, after the upload feature supplies a final mediaId. */
export function useUploadPage() {
  const options = useUploadOptions();
  const uploads = useFileUploads();
  const { add } = useAlbumMediaActions();
  const categories = useAssignMediaCategories();
  const tags = useAssignMediaTags();
  const { refresh: refreshMedia } = useMediaActions();
  const queue = useUploadQueue({
    uploads,
    options: options.selection,
    onReady: async (item, mediaId, signal) => {
      const selected = item.options;
      if (selected.albumId && !item.assignment.album) {
        signal.throwIfAborted();
        await add.mutateAsync({ albumId: selected.albumId, mediaId });
        item.assignment.album = true;
      }
      if (selected.categoryIds.length && !item.assignment.categories) {
        signal.throwIfAborted();
        await categories.mutateAsync({ mediaId, categoryIds: selected.categoryIds });
        item.assignment.categories = true;
      }
      if (selected.tagIds.length && !item.assignment.tags) {
        signal.throwIfAborted();
        await tags.mutateAsync({ mediaId, tagIds: selected.tagIds });
        item.assignment.tags = true;
      }
      signal.throwIfAborted();
      await refreshMedia();
    },
  });
  return { options, queue, accept: DEFAULT_UPLOAD_POLICY.supportedMimeTypes.join(',') };
}
