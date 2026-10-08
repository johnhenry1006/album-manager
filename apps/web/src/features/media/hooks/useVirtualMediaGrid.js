import { observeElementRect, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { getMediaGridLayout, getMediaRowCount } from '../utils/mediaGrid.js';

const EMPTY_ITEMS = [];

/** Row virtualization, container geometry and caller-owned pagination. No API calls. */
export function useVirtualMediaGrid({
  items = EMPTY_ITEMS,
  minColumnWidth = 180,
  gap = 12,
  aspectRatio = 1,
  overscan = 3,
  endThreshold = 2,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  paginationKey = '',
  nextCursor,
} = {}) {
  if (
    !Number.isSafeInteger(overscan) ||
    overscan < 0 ||
    !Number.isSafeInteger(endThreshold) ||
    endThreshold < 0
  )
    throw new TypeError('Invalid row thresholds.');
  const scrollRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [requestPending, setRequestPending] = useState(false);
  const lastRequest = useRef(null);
  const layout = getMediaGridLayout(width, { minColumnWidth, gap, aspectRatio });
  const { columnCount, rowHeight } = layout;
  const rowCount = getMediaRowCount(items.length, columnCount);
  const observeRect = useCallback(
    (instance, notify) =>
      observeElementRect(instance, (rect) => {
        // clientWidth excludes a vertical scrollbar; cards must fit the content box.
        setWidth(instance.scrollElement.clientWidth || rect.width);
        notify(rect);
      }),
    [],
  );
  const getItemKey = useCallback(
    (index) => `${columnCount}:${items[index * columnCount].id}`,
    [columnCount, items],
  );
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey,
    gap,
    overscan,
    observeElementRect: observeRect,
  });
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, columnCount, rowHeight]);
  const virtualRows = virtualizer.getVirtualItems();
  const endIndex = virtualizer.range?.endIndex ?? -1;
  const isNearEnd =
    width > 0 && rowCount > 0 && endIndex >= 0 && endIndex >= rowCount - 1 - endThreshold;
  const requestKey = JSON.stringify([
    paginationKey,
    nextCursor,
    items.length,
    items[0]?.id,
    items.at(-1)?.id,
  ]);
  useEffect(() => {
    if (!isNearEnd) {
      lastRequest.current = null;
      return;
    }
    if (
      !hasNextPage ||
      isFetchingNextPage ||
      requestPending ||
      !onLoadMore ||
      lastRequest.current === requestKey
    )
      return;
    lastRequest.current = requestKey;
    setRequestPending(true);
    const load = async () => {
      try {
        await onLoadMore();
      } catch {
        /* The caller owns request errors; don't automatically retry the same page. */
      } finally {
        setRequestPending(false);
      }
    };
    void load();
  }, [hasNextPage, isFetchingNextPage, isNearEnd, onLoadMore, requestKey, requestPending]);
  return {
    scrollRef,
    virtualizer,
    virtualRows,
    rowCount,
    ...layout,
    isNearEnd,
    isLoadingMore: isFetchingNextPage || requestPending,
    totalHeight: virtualizer.getTotalSize(),
  };
}
