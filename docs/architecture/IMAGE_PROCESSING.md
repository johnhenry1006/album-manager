# Image processing and optimization settings

`apps/api/src/infrastructure/image-processing/index.js` exports the `ImageProcessor`
contract, `SharpImageProcessor`, and sanitized `ImageProcessingError`. The adapter
accepts encoded `Buffer`/`Uint8Array` bytes and returns derivative buffers. It does
not read settings, environment variables, storage, or persistence. The dedicated media worker consumes this adapter; HTTP settings routes are not wired yet.

Composition uses the settings module's public interface:

```js
import { SharpImageProcessor } from '#infrastructure/image-processing/index.js';
import { createSettingsModule } from '#modules/settings/index.js';

const { imageOptimizationSettingsService } = createSettingsModule(database.client);
const options = await imageOptimizationSettingsService.getSettings();
const processor = new SharpImageProcessor();
const result = await processor.process(originalBytes, options);
```

`inspect(bytes)` reports orientation-normalized width, height, aspect ratio,
source format, original EXIF orientation, and alpha presence. `extractMetadata(bytes)` extracts supported EXIF camera, lens, exposure and GPS fields, with a JSON-safe rawMetadata projection; absent or malformed optional EXIF returns an empty object. `inspect` also reports decoded MIME type. `process(bytes,
options)` returns `{ source, variants }`. Each variant has `type`, a distinct
`name`, `maxSize`, encoded `data`, actual dimensions/aspect ratio, byte `fileSize`,
`format`, `contentType`, `quality`, and `losslessEncoding`.

All derivatives normalize EXIF rotation and mirroring, preserve aspect ratio,
fit within the configured square, and never upscale. Source bytes are copied;
there is no write-in-place operation. Derivatives omit source metadata. Processing
is sequential to limit simultaneous native decoding/encoding memory. The default
input limit is 100 million pixels, configurable through constructor injection.
Malformed, oversized, animated, and multi-page images fail with a sanitized 422
error; animation is not silently reduced to its first frame.

## Defaults and encoding modes

| Variant                                | Maximum long edge | Default format |
| -------------------------------------- | ----------------- | -------------- |
| OPTIMIZED                              | 2560              | WebP           |
| PREVIEW                                | 1600              | WebP           |
| THUMBNAIL                              | 800, 400, 200     | WebP           |
| BLUR_PLACEHOLDER (optional tiny image) | 32                | WebP           |

The placeholder is disabled by default. It is a small image buffer suitable for
display while larger derivatives load; the adapter does not add a blur filter.

| Mode               | WebP quality                     | Encoder effort | Lossless encoding |
| ------------------ | -------------------------------- | -------------- | ----------------- |
| LOSSLESS           | 100 (compression effort setting) | 6              | Yes               |
| BALANCED (default) | 80                               | 4              | No                |
| HIGH_QUALITY       | 90                               | 5              | No                |
| MAX_COMPRESSION    | 60                               | 6              | No                |

LOSSLESS preserves the pixels presented to the WebP encoder, including transparent
RGB values. Resizing, orientation normalization, color conversion, and metadata
removal mean the complete transformation is not a mathematically lossless copy of
the original. Other modes are explicitly lossy. Their goal is high visual quality
with smaller display files; smaller output is not guaranteed for every source.
See Sharp's [WebP options](https://sharp.pixelplumbing.com/api-output/#webp) and
[orientation behavior](https://sharp.pixelplumbing.com/api-operation/#autoorient).

## Settings boundary

`ImageOptimizationSettingsService` exposes `getSettings()` and
`replaceOverrides(input)`. Its injected repository is the only settings code
that accesses Prisma. The `ApplicationSetting` key is `imageOptimization`; its
JSON value contains partial overrides. Missing rows and empty overrides return
the application defaults. `replaceOverrides` replaces the entire override object;
an empty object resets defaults. No cache is used: each read produces a fresh,
immutable, complete snapshot for a caller to use throughout a job.

Unknown keys, invalid modes/types, unsupported formats, duplicate thumbnail
sizes, and out-of-range sizes are rejected. WebP target sizes must be integers
from 1 through 16383; placeholders are limited to 64 pixels and thumbnails to
eight distinct sizes. Invalid persisted values fail with
`INVALID_PERSISTED_IMAGE_SETTINGS` (500), without exposing those values or silently
changing processing behavior. Invalid replacement input fails with
`INVALID_IMAGE_SETTINGS` (400), before persistence. Repository failures propagate.

The settings domain and adapter share a pure options contract in `shared`.
The adapter requires every normalized field and supplies no runtime defaults.

## Persistence and worker

Migration `20261008120000_media_processing` adds rendition `name` to the variant
identity `(mediaId, type, format, name)`. Three WebP thumbnails now have separate
identities. Existing non-thumbnail renditions are backfilled with canonical names;
legacy thumbnails with an exact 800/400/200 long edge receive the matching name.
Other legacy thumbnails retain `default`, since their requested size cannot be
inferred after downscaling. ORIGINAL rows retain `default` and remain immutable.

See [Media-processing worker](MEDIA_PROCESSING.md) for orchestration and retries.
