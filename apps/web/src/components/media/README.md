# Shared media images

These components are presentation primitives. They do not import feature/page
code, fetch metadata, or request original media.

```jsx
<ResponsiveImage
  thumbnails={media.thumbnails}
  alt={media.originalFilename}
  width={media.width}
  height={media.height}
  aspectRatio={media.aspectRatio}
  sizes="(max-width: 600px) 100vw, 320px"
/>
```

For detail data, pass `variants` instead of `thumbnails`. Only descriptors with
`type: 'THUMBNAIL'` or `type: 'PREVIEW'` are accepted in `variants`. Compact list
`thumbnails` need no type; an explicit incompatible type is still rejected.
There is no raw `src` prop or original fallback. The smallest available derivative
is the fallback `src`; the browser chooses from the width-based `srcset` using
`sizes`. Set `sizes` to match the layout (default `100vw`). Candidates with duplicate
widths keep the first URL; unknown widths remain usable as `src` but not `srcset`.
URLs are preserved, including signed query strings; whitespace/comma URLs are
excluded because they cannot be inserted unambiguously into `srcset`.

Images always use lazy loading and async decoding. Loading uses the existing
shared skeleton; failure uses local text without another image request. `alt`
defaults to an empty string for decorative images and is retained on the error
fallback when provided. Optional `onLoad`/`onError` callbacks receive native React
image events. Source changes reset loading state; equivalent descriptors do not.

The wrapper fills its parent's width. Its ratio comes from positive `aspectRatio`,
then known width/height (props or the chosen derivative), then a square default.
Supply known dimensions or a ratio to reserve the correct space before load.
`objectFit` defaults to `cover`; use `contain` when the entire image must be visible.
`className` styles the outer frame. `ImagePlaceholder` and `ImageFallback` are
positioned overlays for use inside a positioned image frame.

`buildMediaSrcSet(variants)` is a pure utility for explicitly typed derivative
candidates. It sorts valid positive integer widths and omits originals, unknown
variant types, invalid URLs and duplicate widths.
