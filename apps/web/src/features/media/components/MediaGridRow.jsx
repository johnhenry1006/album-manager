import { memo, useMemo } from 'react';

import { getMediaRowItems } from '../utils/mediaGrid.js';
import { MediaCard } from './MediaCard.jsx';
import styles from './VirtualMediaGrid.module.css';

export const MediaGridRow = memo(function MediaGridRow({
  items,
  rowIndex,
  columnCount,
  start,
  height,
  gap,
  aspectRatio,
  sizes,
  onActivate,
}) {
  const rowItems = useMemo(
    () => getMediaRowItems(items, rowIndex, columnCount),
    [items, rowIndex, columnCount],
  );
  return (
    <div
      role="presentation"
      className={styles.row}
      data-column-count={columnCount}
      style={{
        height,
        transform: `translateY(${start}px)`,
        gap,
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      }}
    >
      {rowItems.map((media) => (
        <MediaCard
          key={media.id}
          media={media}
          aspectRatio={aspectRatio}
          sizes={sizes}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
});
