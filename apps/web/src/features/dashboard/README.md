# Dashboard feature

Public exports are `useDashboardSummary` and `dashboardQueryKeys`. The API adapter
is private. The feature query passes its AbortSignal to the shared HTTP client and
uses the application defaults: 30-second freshness, five-minute retention, no
automatic retry, and no refetch on window focus.

The page follows this path:

```text
DashboardPage → useDashboardPage → feature index → useDashboardSummary
                                                → dashboardApi → httpClient
```

The page hook exposes summary sections, query state and a manual refresh action.
Initial failures show the shared error component with retry; failed refreshes retain
the last summary. Initial loading uses the shared spinner. Empty recent lists use
the shared empty state. Recent albums reuse `AlbumCover` through the album public
index and supply `coverMedia`, avoiding detail queries. Recent media reuse
`ResponsiveImage` with thumbnail arrays; originals are never image sources.

The dashboard response contains at most five albums and five media items with
at most three thumbnails per item/cover. No extra collection or per-item queries
are needed. Image failures and unavailable thumbnails use the shared local fallback.
Cards link to album/media detail routes.

Storage totals are decimal strings. The shared `formatBytes` utility uses BigInt
for safe formatting; exact recorded bytes appear in each metric's title. Missing
storage totals appear as an em dash, and zeros remain visible. Estimated savings
compare optimized renditions with originals; the page explains that originals
remain stored and totals exclude trash.

Tests exercise the real feature/page path with fetch substituted at the HTTP
boundary: loading, empty and error/retry states, refresh failure retention, supplied
thumbnail reuse, request sharing, cancellation, and precise byte formatting.
