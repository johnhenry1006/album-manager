# Album module design

Implement the eight requested single-user album endpoints using the existing Album and AlbumMedia models. JavaScript only; thin controllers, services for domain rules, repositories for persistence, validators for input, mappers for explicit output. Storage signing uses the existing provider.

Album creation requires name; accepts slug, description and visibility (PRIVATE default). Generate a slug from name plus a UUID when omitted. Explicit slugs remain globally unique, including deleted albums; conflicts return 409. Cover may be null on creation; a non-null cover must already belong to the album and therefore is assigned after adding membership. PATCH accepts those fields and nullable coverMediaId.

Album list accepts page (default 1), limit (default 50, maximum 200), q (literal case-insensitive name/description search). Return items and pagination {page, limit, total, totalPages}; sort createdAt descending then id descending. Exclude deleted albums everywhere. Detail includes counts {media, images, videos} for live members only. Delete sets deletedAt and never removes media, stored files or memberships; deleted albums return 404.

POST album media accepts {mediaId, position?}; require live media, append after the highest persisted position by default, retain an existing member's position on repeat requests, and change it when explicitly supplied. Positions are nonnegative PostgreSQL integers; ties are allowed and ordered by membership UUID. DELETE removes only membership and clears cover if necessary. Return 204 for deletes, 201 for album creation, 200 for idempotent membership assignment.

Album media accepts limit (default 50, max 200) and cursor, returns {items, nextCursor, hasMore}. Each item has membershipId, position and the existing compact gallery media fields, with signed thumbnails only. Versioned cursor binds albumId and contains position and membership id. Value-based comparisons survive deletion of the anchor. Pagination is not a snapshot during reordering.

A non-null cover must reference live media with membership in that album. Serialize mutations by locking the album row in a transaction; lock referenced media before testing liveness. Removal clears cover in that transaction. Cover output is null when referenced media has subsequently been soft-deleted. Detail counts use a consistent read transaction.

Tests cover malformed input and cursors, all routes, centralized errors, cover assignment/removal, soft deletion and media survival, multiple albums, tied positions, anchor deletion, literal search, counts and lightweight gallery payloads. PostgreSQL tests use isolated schemas and rolled-back fixtures.
