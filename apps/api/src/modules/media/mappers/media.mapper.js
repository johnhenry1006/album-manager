const MEDIA_FIELDS = [
    'id',
    'type',
    'originalFilename',
    'mimeType',
    'extension',
    'fileSize',
    'width',
    'height',
    'aspectRatio',
    'checksum',
    'status',
    'takenAt',
    'createdAt',
    'updatedAt',
    'deletedAt',
];
const VARIANT_FIELDS = [
    'id',
    'mediaId',
    'type',
    'format',
    'name',
    'width',
    'height',
    'fileSize',
    'storageKey',
    'quality',
    'createdAt',
];

// Backend domain contracts retain BigInt and Date. HTTP serialization belongs to a later API.
function project(record, fields) {
    if (!record) return null;
    return Object.fromEntries(
        fields.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]]),
    );
}

export function mapMedia(record) {
    return project(record, MEDIA_FIELDS);
}

export function mapMediaVariant(record) {
    return project(record, VARIANT_FIELDS);
}
