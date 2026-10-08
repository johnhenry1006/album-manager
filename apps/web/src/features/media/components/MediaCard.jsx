import { memo } from 'react';

import { ResponsiveImage } from '@/components/media/ResponsiveImage.jsx';

import styles from './VirtualMediaGrid.module.css';

export const MediaCard = memo(function MediaCard({ media, aspectRatio = 1, sizes, onActivate }) {
  const label = media.originalFilename || 'Media';
  const content = (
    <>
      <ResponsiveImage
        thumbnails={media.thumbnails}
        variants={media.variants}
        width={media.width}
        height={media.height}
        aspectRatio={aspectRatio}
        sizes={sizes}
        alt={label}
      />
      <span className={styles.caption} title={label}>
        {label}
      </span>
    </>
  );
  return (
    <div role="listitem" data-media-id={media.id} className={styles.card} style={{ aspectRatio }}>
      {onActivate ? (
        <button
          type="button"
          className={styles.activate}
          aria-label={`Open ${label}`}
          onClick={() => onActivate(media)}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </div>
  );
});
