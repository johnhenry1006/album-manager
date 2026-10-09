import { createMediaThumbnails } from '#modules/media/index.js';

import { mapDashboard } from '../mappers/dashboard.mapper.js';
import { createDashboardSummaryReader } from './dashboardSummary.service.js';

export function createDashboardService({
    repository,
    storage,
    config = { urlExpirySeconds: 900 },
    now,
    summaryReader = createDashboardSummaryReader({ repository, now }),
}) {
    return Object.freeze({
        async summary() {
            const [summary, albums, media] = await Promise.all([
                summaryReader(),
                repository.recentAlbums(),
                repository.recentMedia(),
            ]);
            // Only aggregates are cached; signed thumbnails are refreshed on every request.
            const thumbnails = (record) =>
                storage
                    ? createMediaThumbnails(record.variants ?? [], {
                          storage,
                          urlExpirySeconds: config.urlExpirySeconds,
                      })
                    : Promise.resolve([]);
            const [recentAlbums, recentMedia] = await Promise.all([
                Promise.all(
                    albums.map(async (album) => {
                        const cover = album.coverMedia && !album.coverMedia.deletedAt ? album.coverMedia : null;
                        return {
                            ...album,
                            coverMediaId: cover?.id ?? null,
                            coverMedia: cover ? { id: cover.id, thumbnails: await thumbnails(cover) } : null,
                        };
                    }),
                ),
                Promise.all(media.map(async (record) => ({ ...record, thumbnails: await thumbnails(record) }))),
            ]);
            return mapDashboard(summary, recentAlbums, recentMedia);
        },
    });
}
