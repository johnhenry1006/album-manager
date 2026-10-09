import { mediaThumbnailQuery } from '#modules/media/index.js';

const RECENT_LIMIT = 5;
const DASHBOARD_THUMBNAILS = { ...mediaThumbnailQuery, take: 3 };
const RECENT_QUERY = {
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: RECENT_LIMIT,
};

export function createDashboardRepository(client) {
    return Object.freeze({
        async readAggregates() {
            // Group variants before joining: multiple formats must not multiply media counts
            // or original sizes. One statement gives every aggregate the same DB snapshot.
            const [row] = await client.$queryRaw`
        WITH optimized AS (
          SELECT media_id, SUM(file_size) AS bytes
          FROM media_variants
          WHERE type = 'OPTIMIZED'
          GROUP BY media_id
        )
        SELECT
          COUNT(*) AS "mediaCount",
          COUNT(*) FILTER (WHERE m.status = 'PROCESSING') AS "processingCount",
          COUNT(*) FILTER (WHERE m.status = 'FAILED') AS "failedCount",
          COALESCE(SUM(m.file_size), 0)::text AS "originalBytes",
          COALESCE(SUM(o.bytes), 0)::text AS "optimizedBytes",
          COALESCE(SUM(CASE WHEN o.media_id IS NOT NULL
            THEN GREATEST(m.file_size - o.bytes, 0) ELSE 0 END), 0)::text AS "savedBytes",
          (SELECT COUNT(*) FROM albums WHERE deleted_at IS NULL) AS "albumCount",
          (SELECT COUNT(*) FROM categories) AS "categoryCount",
          (SELECT COUNT(*) FROM tags) AS "tagCount"
        FROM media m
        LEFT JOIN optimized o ON o.media_id = m.id
        WHERE m.deleted_at IS NULL
      `;
            return row;
        },
        recentAlbums() {
            return client.album.findMany({
                ...RECENT_QUERY,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    visibility: true,
                    createdAt: true,
                    coverMediaId: true,
                    coverMedia: { select: { id: true, deletedAt: true, variants: DASHBOARD_THUMBNAILS } },
                },
            });
        },
        recentMedia() {
            return client.media.findMany({
                ...RECENT_QUERY,
                select: {
                    id: true,
                    type: true,
                    originalFilename: true,
                    status: true,
                    width: true,
                    height: true,
                    createdAt: true,
                    variants: DASHBOARD_THUMBNAILS,
                },
            });
        },
    });
}
