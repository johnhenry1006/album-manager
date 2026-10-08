import { useMediaFilters } from '@/features/media/index.js';

const FILTER_NAMES = ['q', 'type', 'category', 'tag', 'takenAtFrom', 'takenAtTo', 'favorite'];

export function useMediaLibraryFilters() {
  return useMediaFilters(FILTER_NAMES);
}
