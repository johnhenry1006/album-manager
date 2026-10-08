import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { createQueryClient } from '@/services/queryClient.js';

import { useCategoryListPage } from './useCategoryListPage.js';

it('supports deep hierarchies when selecting a parent and excludes the edited subtree', () => {
  let children = [];
  for (let index = 3999; index >= 0; index--) {
    children = [{ id: String(index), name: `Category ${index}`, children }];
  }
  const client = createQueryClient();
  client.setQueryData(['category', 'tree'], { items: children });
  const hook = renderHook(() => useCategoryListPage(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  act(() => hook.result.current.editor.openEditor());
  expect(hook.result.current.parentOptions).toHaveLength(4000);
  expect(hook.result.current.parentOptions[3999].id).toBe('3999');
  act(() => hook.result.current.editor.openEditor({ id: '1', name: 'Category 1' }));
  expect(hook.result.current.parentOptions).toEqual([{ id: '0', label: 'Category 0' }]);
  hook.unmount();
  client.clear();
});
