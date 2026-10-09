export function createStorageStatisticsRepository(client) {
    return Object.freeze({
        async readAggregates() {
            // All persisted variants count, including trash. One statement provides a
            // consistent snapshot without loading object keys or listing the bucket.
            const [row] = await client.$queryRaw`
                WITH per_media AS (
                    SELECT media_id, COUNT(*) AS objects,
                        COALESCE(SUM(file_size) FILTER (WHERE type = 'ORIGINAL'), 0) AS original,
                        COALESCE(SUM(file_size) FILTER (WHERE type = 'OPTIMIZED'), 0) AS optimized,
                        COALESCE(SUM(file_size) FILTER (WHERE type <> 'ORIGINAL'), 0) AS variants,
                        COUNT(*) FILTER (WHERE type = 'ORIGINAL') AS originals,
                        COUNT(*) FILTER (WHERE type = 'OPTIMIZED') AS optimized_count
                    FROM media_variants
                    GROUP BY media_id
                )
                SELECT COALESCE(SUM(objects), 0)::text AS "objectCount",
                    COALESCE(SUM(original), 0)::text AS "originalBytes",
                    COALESCE(SUM(optimized), 0)::text AS "optimizedBytes",
                    COALESCE(SUM(variants), 0)::text AS "variantBytes",
                    COALESCE(SUM(CASE WHEN originals > 0 AND optimized_count > 0
                        THEN GREATEST(original - optimized, 0) ELSE 0 END), 0)::text AS "estimatedSavedBytes"
                FROM per_media
            `;
            return row;
        },
    });
}
