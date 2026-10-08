import { useMediaFilters } from '@/features/media/index.js';

/** Search and library share media metadata filters; the URL owns their state. */
export function useSearchFilters() {
  return useMediaFilters();
}
