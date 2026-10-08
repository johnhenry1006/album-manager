# Categories feature

Consumers import hooks from `@/features/category/index.js`. API adapters and query
keys are private. No management UI is included.

- `useCategories({ page, limit, q }, { enabled })` returns a TanStack Query
  result with `data.items` and `data.pagination`. Defaults: page 1, limit 50.
- `useCreateCategory().mutateAsync(metadata)` creates metadata.
- `useUpdateCategory().mutateAsync({ id, ...metadata })` patches metadata.
- `useDeleteCategory().mutateAsync(id)` permanently deletes metadata.
- `useAssignMediaCategories().mutateAsync({ mediaId, categoryIds })` assigns
  to one media item; use `{ mediaIds, categoryIds }` for batch assignment.
  Assignments add links and preserve existing links.

Create refreshes taxonomy lists and trees. Update/delete also refresh media lists
and details, whose filters or embedded metadata may have changed. Assignments
refresh media caches. Failed mutations preserve cached data; errors use the
centralized HTTP error layer. Queries forward cancellation signals.

`useCategories({ tree: true })` returns `data.items` as a complete hierarchy
with `children` arrays. Tree requests cannot include page, limit, or q. Prefer
paginated queries for large taxonomies. `tree: false` uses the paginated list.
Category metadata may include `parentId`; tags do not support hierarchy fields.
