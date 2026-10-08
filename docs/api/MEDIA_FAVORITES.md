# Favorite media mutations

Favorites are global in the single-user MVP. There is no user identifier or
ownership filter.

| Route                                 | Result                              |
| ------------------------------------- | ----------------------------------- |
| `POST /api/media/:mediaId/favorite`   | Ensure the media is a favorite.     |
| `DELETE /api/media/:mediaId/favorite` | Ensure the media is not a favorite. |

Both routes return HTTP `204` with no response body. Repeating a POST preserves
the existing favorite row and its creation timestamp. Removing an absent favorite
also returns `204` when the media exists and is not soft-deleted.

`mediaId` must be a UUID. These endpoints accept no query parameters or request
body. Invalid input returns `400`; missing or soft-deleted media returns `404`
for either mutation. Errors use the existing centralized response format
(`HTTP_ERROR` for these client errors and `INTERNAL_ERROR` for server errors).

The canonical collection remains `GET /api/media?favorite=true`; use
`favorite=false` for non-favorites. Media list and detail responses already expose
the favorite flag. There is no `GET /api/favorites` collection endpoint.

The service validates input and requires live media inside a transaction. The
repository locks the media row to serialize mutations with each other and media
soft deletion. Insertion uses conflict-safe persistence backed by the existing
unique `Favorite.mediaId` constraint; deletion accepts zero matching rows. No
schema migration is required. These routes require only a database dependency;
storage and queue providers are unnecessary.

Tests:

```sh
npm test --workspace @album-manager/api -- src/modules/media/routes/mediaFavorite.routes.test.js src/modules/media/repositories/mediaFavorite.repository.test.js
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/media/repositories/mediaFavorite.integration.test.js
```

The integration tests use a disposable PostgreSQL schema, covering canonical
filter updates, missing/deleted media, uniqueness and concurrent mutations.
