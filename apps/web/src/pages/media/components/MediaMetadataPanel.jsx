import { Link } from 'react-router';

import { ConfirmDialog } from '@/components/common/ConfirmDialog.jsx';
import { ErrorState } from '@/components/common/ErrorState.jsx';

import styles from './MediaDetail.module.css';

const METADATA_FIELDS = [
  ['cameraMake', 'Camera make'],
  ['cameraModel', 'Camera model'],
  ['lens', 'Lens'],
  ['focalLength', 'Focal length'],
  ['aperture', 'Aperture'],
  ['iso', 'ISO'],
  ['shutterSpeed', 'Shutter speed'],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude'],
];
function displayDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { timeZone: 'UTC' })
    : 'Unknown';
}
function Memberships({ title, items, href, emptyLabel }) {
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      {items?.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link to={href(item.id)}>{item.name}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </section>
  );
}

export function MediaMetadataPanel({ media, actions }) {
  const fields = [
    ['Filename', media.originalFilename],
    ['Type', media.type],
    ['MIME type', media.mimeType],
    ['Status', media.status],
    [
      'File size',
      media.fileSize === null || media.fileSize === undefined ? null : `${media.fileSize} bytes`,
    ],
    ['Dimensions', media.width && media.height ? `${media.width} × ${media.height}` : null],
    ['Captured (UTC)', displayDate(media.takenAt)],
    ['Created (UTC)', displayDate(media.createdAt)],
    ['Updated (UTC)', displayDate(media.updatedAt)],
    ...(media.type === 'VIDEO'
      ? [
          [
            'Duration',
            media.metadata?.duration === null || media.metadata?.duration === undefined
              ? null
              : `${media.metadata.duration} seconds`,
          ],
          ['Video codec', media.metadata?.videoCodec],
          ['Audio codec', media.metadata?.audioCodec],
          [
            'Frame rate',
            media.metadata?.frameRate === null || media.metadata?.frameRate === undefined
              ? null
              : `${media.metadata.frameRate} fps`,
          ],
          [
            'Bitrate',
            media.metadata?.bitrate === null || media.metadata?.bitrate === undefined
              ? null
              : `${media.metadata.bitrate} bits/s`,
          ],
        ]
      : []),
    ...METADATA_FIELDS.map(([field, label]) => [label, media.metadata?.[field]]),
  ];
  return (
    <aside aria-label="Media metadata" className={styles.metadata}>
      <h2>Metadata</h2>
      <dl className={styles.fields}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? 'Unknown'}</dd>
          </div>
        ))}
      </dl>
      {media.metadata?.rawMetadata && (
        <details>
          <summary>Additional metadata</summary>
          <pre className={styles.raw}>{JSON.stringify(media.metadata.rawMetadata, null, 2)}</pre>
        </details>
      )}
      <Memberships
        title="Albums"
        items={media.albums}
        href={(id) => `/albums/${encodeURIComponent(id)}`}
        emptyLabel="No albums"
      />
      <Memberships
        title="Categories"
        items={media.categories}
        href={(id) => `/media?${new URLSearchParams({ category: id })}`}
        emptyLabel="No categories"
      />
      <Memberships
        title="Tags"
        items={media.tags}
        href={(id) => `/media?${new URLSearchParams({ tag: id })}`}
        emptyLabel="No tags"
      />
      <div className={styles.actions}>
        <button
          type="button"
          disabled={actions.disabled}
          aria-pressed={media.favorite}
          onClick={actions.changeFavorite}
        >
          {actions.isFavoritePending
            ? 'Updating favorite…'
            : media.favorite
              ? 'Remove from favorites'
              : 'Add to favorites'}
        </button>
        <button type="button" disabled={actions.disabled} onClick={actions.moveToTrash}>
          {actions.isTrashPending ? 'Moving to trash…' : 'Move to trash'}
        </button>
      </div>
      <ConfirmDialog
        {...actions.trashConfirmation}
        title={`Move ${media.originalFilename} to trash?`}
        description="You can restore this media from Trash."
        confirmLabel="Confirm move to trash"
        pendingLabel="Moving to trash…"
      />
      {actions.favoriteError && (
        <ErrorState
          title="Could not update favorite"
          description={actions.favoriteError.message}
          onRetry={actions.changeFavorite}
          isRetrying={actions.disabled}
        />
      )}
      {actions.trashError && !actions.trashConfirmation.open && (
        <ErrorState
          title="Could not move to trash"
          description={actions.trashError.message}
          onRetry={actions.moveToTrash}
        />
      )}
    </aside>
  );
}
