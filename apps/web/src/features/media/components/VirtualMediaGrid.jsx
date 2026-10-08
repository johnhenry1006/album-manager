import { memo } from 'react';

import { Spinner } from '@/components/ui/Spinner.jsx';

import { useVirtualMediaGrid } from '../hooks/useVirtualMediaGrid.js';
import { MediaEmptyState } from './MediaEmptyState.jsx';
import { MediaGridRow } from './MediaGridRow.jsx';
import styles from './VirtualMediaGrid.module.css';

const EMPTY_ITEMS = [];

export const VirtualMediaGrid = memo(function VirtualMediaGrid({
  items = EMPTY_ITEMS,
  height = 600,
  minColumnWidth = 180,
  gap = 12,
  aspectRatio = 1,
  overscan = 3,
  endThreshold = 2,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  paginationKey,
  nextCursor,
  onActivate,
  isSelected,
  onToggleSelection,
  selectionDisabled = false,
  isLoading = false,
  label = 'Media gallery',
  className = '',
  emptyTitle,
  emptyDescription,
}) {
  const grid = useVirtualMediaGrid({
    items,
    minColumnWidth,
    gap,
    aspectRatio,
    overscan,
    endThreshold,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    paginationKey,
    nextCursor,
  });
  const sizes = `${Math.ceil(grid.cardWidth)}px`;
  return (
    <div
      ref={grid.scrollRef}
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`${styles.viewport} ${className}`}
      style={{ height }}
      aria-busy={isLoading || grid.isLoadingMore}
    >
      {items.length > 0 ? (
        <div
          role="list"
          aria-label="Media"
          className={styles.content}
          style={{ height: grid.totalHeight }}
        >
          {grid.virtualRows.map((row) => (
            <MediaGridRow
              key={row.key}
              items={items}
              rowIndex={row.index}
              columnCount={grid.columnCount}
              start={row.start}
              height={grid.rowHeight}
              gap={gap}
              aspectRatio={aspectRatio}
              sizes={sizes}
              onActivate={onActivate}
              isSelected={isSelected}
              onToggleSelection={onToggleSelection}
              selectionDisabled={selectionDisabled}
            />
          ))}
        </div>
      ) : isLoading ? (
        <Spinner label="Loading media" />
      ) : (
        <MediaEmptyState title={emptyTitle} description={emptyDescription} />
      )}
      {grid.isLoadingMore && <Spinner label="Loading more media" />}
    </div>
  );
});
