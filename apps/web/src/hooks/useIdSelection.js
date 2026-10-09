import { useCallback, useState } from 'react';

/** IDs persist across pagination/filter changes. The consumer chooses when to reset/reconcile. */
export function useIdSelection(initialIds = []) {
  const [selection, setSelection] = useState(() => new Set(initialIds));
  const select = useCallback((id) => setSelection((current) => new Set(current).add(id)), []);
  const deselect = useCallback(
    (id) =>
      setSelection((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      }),
    [],
  );
  const toggle = useCallback(
    (id) =>
      setSelection((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const selectAll = useCallback(
    (ids) => setSelection((current) => new Set([...current, ...ids])),
    [],
  );
  const clearSelection = useCallback(() => setSelection(new Set()), []);
  const retainSelection = useCallback((ids) => {
    const allowed = new Set(ids);
    setSelection((current) => new Set([...current].filter((id) => allowed.has(id))));
  }, []);
  const isSelected = useCallback((id) => selection.has(id), [selection]);
  return {
    selectedIds: [...selection],
    selectedCount: selection.size,
    isSelected,
    select,
    deselect,
    toggle,
    selectAll,
    clearSelection,
    retainSelection,
  };
}
