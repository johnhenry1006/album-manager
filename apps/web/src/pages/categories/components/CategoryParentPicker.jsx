import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/common/EmptyState.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';
import { useDebounce } from '@/hooks/useDebounce.js';

/** Local hierarchy options: search and paginate without additional requests. */
export function CategoryParentPicker({ options, value, onChange }) {
  const [search, setSearch] = useState('');
  const [requestedPage, setPage] = useState(1);
  const debouncedSearch = useDebounce(search.trim().toLowerCase());
  const isSearching = search.trim().toLowerCase() !== debouncedSearch;
  const matches = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(debouncedSearch)),
    [options, debouncedSearch],
  );
  const totalPages = Math.max(1, Math.ceil(matches.length / 50));
  const page = Math.min(requestedPage, totalPages);
  const visible = matches.slice((page - 1) * 50, page * 50);
  const selected = options.find((option) => option.id === value);
  return (
    <div>
      {options.length > 50 && (
        <label>
          Search parent categories{' '}
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
      )}
      <p>
        <label>
          Parent category{' '}
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">None (root category)</option>
            {selected && !visible.some((option) => option.id === value) && (
              <option value={selected.id}>{selected.label}</option>
            )}
            {visible.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </p>
      {isSearching && <Spinner label="Searching parent categories…" />}
      {!isSearching && matches.length === 0 && (
        <EmptyState
          title="No matching parent categories"
          description="Choose None to create a root category, or change your search."
        />
      )}
      {matches.length > 50 && (
        <nav aria-label="Parent category pagination">
          <button
            type="button"
            disabled={isSearching || page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous parents
          </button>{' '}
          <span>
            Page {page} of {totalPages}
          </span>{' '}
          <button
            type="button"
            disabled={isSearching || page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next parents
          </button>
        </nav>
      )}
    </div>
  );
}
