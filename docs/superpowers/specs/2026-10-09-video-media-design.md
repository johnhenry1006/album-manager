# Video support in Media

Videos use the existing Media, MediaMetadata, MediaVariant, UploadFile and AlbumMedia models, processing queue, duplicate gate, storage provider, and lifecycle services. VIDEO is already present in the schema and format registry. No video-specific domain tables or endpoints are introduced.

The worker selects an injected video processor for VIDEO uploads. FFprobe inspects local source bytes and validates MP4, QuickTime or WebM containers and usable video streams. MediaMetadata gains nullable duration (seconds), videoCodec, audioCodec, frameRate and bitrate fields; raw probe metadata remains available. Display dimensions account for rotation and sample aspect ratio.

FFmpeg extracts a poster frame; the existing image processor produces PREVIEW, THUMBNAIL and optional BLUR_PLACEHOLDER variants. FFmpeg generates an OPTIMIZED variant named playback: MP4 with H.264 video, optional AAC audio, square pixels, even dimensions and fast-start metadata. Originals remain immutable. Storage, retry recovery, checksum admission, failure handling, and deletion continue through existing Media services.

The detail API exposes video metadata and signs playback through its current variant mechanism. The viewer renders native video controls with a poster and preload=none. Image source selection excludes video formats. Playback errors support refreshing the signed URL. Albums, manual taxonomy, favorites, trash, and lexical search remain shared; semantic image indexing retains its image-only scope.

External processes use argument arrays, restricted input protocols/demuxers, bounded execution time and output capture, and private temporary directories removed on success and failure. Deployment requires ffmpeg/ffprobe with libx264 and AAC support. Tests cover real source inspection, transcoding, image derivatives, invalid content, worker retries/duplicates, metadata exposure, playback and shared relations.
