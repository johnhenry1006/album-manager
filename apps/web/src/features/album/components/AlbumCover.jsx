import { ResponsiveImage } from '@/components/media/ResponsiveImage.jsx';
import { useMedia } from '@/features/media/index.js';

/** Supply coverMedia from an existing gallery/detail to avoid an extra detail query. */
export function AlbumCover({ album, coverMedia, sizes, aspectRatio = 1, className = '' }) {
  const coverId = album?.coverMediaId;
  const supplied = Boolean(coverId && coverMedia?.id === coverId);
  const query = useMedia(coverId, { enabled: Boolean(coverId) && !supplied });
  const media = coverId ? (supplied ? coverMedia : query.data) : null;
  return (
    <ResponsiveImage
      thumbnails={media?.thumbnails}
      variants={media?.variants?.filter((variant) => variant.type === 'THUMBNAIL')}
      alt={`${album?.name || 'Album'} cover`}
      sizes={sizes}
      aspectRatio={aspectRatio}
      className={className}
    />
  );
}
