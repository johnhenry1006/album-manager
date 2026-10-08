# Categories and tags

The single-user taxonomy module owns category and tag metadata and media
assignments. Shared CRUD and assignment behavior lives in one feature module;
category hierarchy decisions live in a dedicated service. Controllers only
translate HTTP input/output. Repositories own persistence and transactions.

## Routes

| Method | Route                            | Behavior                                        |
| ------ | -------------------------------- | ----------------------------------------------- |
| GET    | `/api/categories`                | Paginated metadata, or a complete tree          |
| POST   | `/api/categories`                | Create category; 201                            |
| PATCH  | `/api/categories/:id`            | Update category metadata or parent; 200         |
| DELETE | `/api/categories/:id`            | Delete a leaf category; 204                     |
| GET    | `/api/tags`                      | Paginated metadata                              |
| POST   | `/api/tags`                      | Create tag; 201                                 |
| PATCH  | `/api/tags/:id`                  | Update tag metadata; 200                        |
| DELETE | `/api/tags/:id`                  | Delete tag; 204                                 |
| POST   | `/api/media/:mediaId/categories` | Add category assignments; 200                   |
| POST   | `/api/media/:mediaId/tags`       | Add tag assignments; 200                        |
| POST   | `/api/media/categories`          | Add category assignments to selected media; 200 |
| POST   | `/api/media/tags`                | Add tag assignments to selected media; 200      |

## Metadata and hierarchy

Create requires `name`: trimmed, 1–255 characters, without newline or NUL.
Optional `slug` uses 1–255 lowercase ASCII letters/digits separated by single
hyphens. An omitted slug is generated from the name with a UUID suffix.
Slugs are globally unique within each taxonomy table. PATCH accepts these fields
and must contain at least one field. Renaming does not regenerate the slug.

Categories additionally accept `parentId`: an existing category UUID or `null`
for a root. Omission on creation makes a root; omission on update preserves the
current parent. Self-parenting and moving a category below any descendant return 400. A missing parent returns 404. Tags reject `parentId`.

Create, update, and list items return only `id`, `name`, `slug`, `createdAt`,
`updatedAt`, plus `parentId` for categories. Timestamps are ISO UTC strings.

Deletion is permanent. A category with children returns 409: delete or reparent
its children first. Deleting a leaf category or tag cascades its assignment rows
through existing foreign keys. Media and stored files remain intact. Deleted
slugs may be reused. No schema migration is required.

## Lists and tree

Lists accept `page` (positive integer, default 1), `limit` (1–200, default 50),
and `q` (trimmed literal substring in name, case-insensitive, 1–255 characters,
without newline or NUL). Wildcards in search text are escaped. Ordering is
`(createdAt DESC, id DESC)`. Page offset must fit a PostgreSQL integer.
Items and total are read in a consistent snapshot. Response:

```json
{
    "items": [],
    "pagination": { "page": 1, "limit": 50, "total": 0, "totalPages": 0 }
}
```

`GET /api/categories?tree=true` returns `{ "items": [...] }` with root categories;
every category has a `children` array. Roots and siblings sort by `(name ASC, id ASC)`.
The tree includes every category, so use paginated lists for large taxonomies.
Tree requests reject `page`, `limit`, and `q` to avoid incomplete hierarchies.
`tree=false` uses ordinary list behavior; other tree values are invalid.
Tags reject the `tree` query parameter.

## Media assignments

Individual assignment bodies are `{ "categoryIds": ["<UUID>"] }` or
`{ "tagIds": ["<UUID>"] }`. Batch bodies additionally require
`mediaIds: ["<UUID>", "<UUID>"]`. Every array requires 1–100 entries before
deduplication. IDs are normalized, deduplicated, and sorted. Responses contain
`mediaIds` and the corresponding `categoryIds` or `tagIds`.

Assignments are additive and idempotent: repeating an existing pair preserves
its row and existing assignments remain. Assigning a category does not implicitly
assign its ancestors. All media must exist and be live (not soft-deleted), and
all taxonomy IDs must exist. A missing/deleted target returns 404. Batch validation
and writes occur in one transaction; a failed target leaves every assignment
unchanged. These routes do not replace or remove existing assignments.

## Concurrency and errors

Writes acquire a transaction-scoped `SHARE ROW EXCLUSIVE` lock on the applicable
category/tag table. This serializes category parent validation, metadata mutation,
deletions, and taxonomy assignments, including conflicting ordinary database writes.
Parent-chain checks run after acquiring the lock under `ReadCommitted`, so
opposing concurrent reparent requests cannot create a cycle. This deliberately
favors simple correctness for a single-user taxonomy over parallel write throughput.
Out-of-band database writers must still enforce hierarchy invariants themselves.

Assignments lock media rows in stable UUID order before checking all targets and
inserting join rows with duplicate skipping. Locks prevent simultaneous deletion
or soft deletion from invalidating the liveness check during assignment. Later
soft deletion preserves existing assignment rows, consistent with media lifecycle.

Malformed bodies, IDs, queries, unknown fields, and empty PATCH return 400.
Missing entities return 404, slug conflicts and deleting non-leaf categories return 409. Errors use centralized responses, with no database details exposed.

## Verification

```sh
npm test --workspace @album-manager/api -- src/modules/taxonomy
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/taxonomy/repositories/taxonomy.integration.test.js
```

PostgreSQL tests create an isolated schema, roll back fixtures, and explicitly
clean up committed concurrency fixtures. They exercise route persistence, slug
conflict rollback, literal search, idempotent and atomic assignments, join cascades,
hierarchy validation, and opposing concurrent reparent operations.
