# Tags feature

Consumers import hooks from `@/features/tag/index.js`. API adapters and query
keys are private. No management UI is included.

- `useTags({ page, limit, q }, { enabled })` returns a TanStack Query
  result with `data.items` and `data.pagination`. Defaults: page 1, limit 50.
- `useCreateTag().mutateAsync(metadata)` creates metadata.
- `useUpdateTag().mutateAsync({ id, ...metadata })` patches metadata.
- `useDeleteTag().mutateAsync(id)` permanently deletes metadata.
- `useAssignMediaTags().mutateAsync({ mediaId, tagIds })` assigns
  to one media item; use `{ mediaIds, tagIds }` for batch assignment.
  Assignments add links and preserve existing links.

Create refreshes taxonomy lists. Update/delete also refresh media lists
and details, whose filters or embedded metadata may have changed. Assignments
refresh media caches. Failed mutations preserve cached data; errors use the
centralized HTTP error layer. Queries forward cancellation signals.
