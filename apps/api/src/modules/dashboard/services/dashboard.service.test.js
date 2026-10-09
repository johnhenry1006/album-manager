import { describe, expect, it } from 'vitest';

import { createDashboardService } from './dashboard.service.js';

const date = new Date('2026-10-09T00:00:00Z');
const aggregates = {
    mediaCount: 4n,
    albumCount: 2n,
    categoryCount: 3n,
    tagCount: 5n,
    processingCount: 1n,
    failedCount: 1n,
    originalBytes: '9007199254740993',
    optimizedBytes: '200',
    savedBytes: '300',
};

function fixture() {
    let time = date.getTime();
    let reads = 0;
    let fail = false;
    const repository = {
        async readAggregates() {
            reads++;
            if (fail) throw new Error('database unavailable');
            return aggregates;
        },
        async recentAlbums() {
            return [
                { id: 'album', name: 'Trip', slug: 'trip', visibility: 'PRIVATE', createdAt: date, secret: 'hidden' },
            ];
        },
        async recentMedia() {
            return [
                {
                    id: 'media',
                    type: 'IMAGE',
                    originalFilename: 'photo.jpg',
                    status: 'PROCESSING',
                    width: null,
                    height: null,
                    createdAt: date,
                    storageKey: 'private',
                },
            ];
        },
    };
    return {
        service: createDashboardService({ repository, now: () => time }),
        repository,
        reads: () => reads,
        advance: (ms) => {
            time += ms;
        },
        fail: (value) => {
            fail = value;
        },
    };
}

describe('dashboard service', () => {
    it('returns precise storage totals and explicitly projected recent metadata', async () => {
        const { service } = fixture();
        expect(await service.summary()).toEqual({
            counts: { media: 4, albums: 2, categories: 3, tags: 5, processingMedia: 1, failedMedia: 1 },
            storage: { originalBytes: '9007199254740993', optimizedBytes: '200', estimatedSavedBytes: '300' },
            summaryUpdatedAt: date.toISOString(),
            recentAlbums: [
                { id: 'album', name: 'Trip', slug: 'trip', visibility: 'PRIVATE', createdAt: date.toISOString() },
            ],
            recentMedia: [
                {
                    id: 'media',
                    type: 'IMAGE',
                    originalFilename: 'photo.jpg',
                    status: 'PROCESSING',
                    width: null,
                    height: null,
                    createdAt: date.toISOString(),
                },
            ],
        });
    });

    it('shares concurrent aggregate refreshes and expires after 30 seconds while recent lists stay fresh', async () => {
        const { service, reads, advance, repository } = fixture();
        await Promise.all([service.summary(), service.summary()]);
        expect(reads()).toBe(1);
        advance(29999);
        repository.recentAlbums = async () => [];
        expect((await service.summary()).recentAlbums).toEqual([]);
        expect(reads()).toBe(1);
        advance(1);
        expect((await service.summary()).summaryUpdatedAt).toBe('2026-10-09T00:00:30.000Z');
        expect(reads()).toBe(2);
    });

    it('does not cache failed refreshes or return expired data', async () => {
        const { service, reads, advance, fail } = fixture();
        await service.summary();
        advance(30000);
        fail(true);
        await expect(service.summary()).rejects.toThrow('database unavailable');
        fail(false);
        await service.summary();
        expect(reads()).toBe(3);
    });

    it('accepts an alternative summary reader for a future shared cache', async () => {
        const { repository } = fixture();
        repository.readAggregates = async () => {
            throw new Error('must use shared cache');
        };
        const service = createDashboardService({
            repository,
            summaryReader: async () => ({ data: aggregates, updatedAt: date }),
        });
        expect((await service.summary()).counts.media).toBe(4);
    });
});
