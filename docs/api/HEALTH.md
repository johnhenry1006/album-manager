# Health endpoint

`GET /api/health` returns HTTP 200 with `application/json`:

```json
{
    "status": "ok",
    "timestamp": "2026-10-08T00:00:00.000Z",
    "version": "0.0.0"
}
```

`timestamp` is the current UTC time in ISO format. `version` is read from the API
workspace package manifest and omitted if its version field is unavailable.
This endpoint reports process liveness and does not inspect PostgreSQL, Redis,
S3, or other adapters. It requires no authentication in the single-user MVP.
`/health` is not registered; the route always lives under the `/api` prefix.

The centralized error format is:

```json
{
    "statusCode": 404,
    "error": "HTTP_ERROR",
    "message": "Route not found",
    "requestId": "req-1"
}
```

Validation errors use `VALIDATION_ERROR` with a safe message; server failures use
`INTERNAL_ERROR` and omit exception details/stack traces. Request IDs correlate
responses with structured request logs. Error responses never echo rejected input.
