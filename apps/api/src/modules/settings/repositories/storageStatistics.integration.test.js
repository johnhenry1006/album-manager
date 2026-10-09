import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { createStorageStatisticsModule } from '../index.js';

describe.skipIf(process.env.DATABASE_TESTS !== '1')('storage statistics with PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());

    it('returns zero totals without any persisted objects', async () => {
        await database.rollback(async (client) => {
            expect(await createStorageStatisticsModule({ client }).service.getStatistics()).toEqual({
                providerType: null,
                endpointHost: null,
                bucketName: null,
                objectCount: 0,
                originalBytes: '0',
                optimizedBytes: '0',
                variantBytes: '0',
                totalBytes: '0',
                estimatedSavedBytes: '0',
            });
        });
    });
    it('counts all stored variants, includes trash, and clamps savings per media without counting unoptimized originals', async () => {
        await database.rollback(async (client) => {
            for (const [index, variants] of [
                [
                    ['ORIGINAL', 9007199254740993n],
                    ['OPTIMIZED', 200n],
                    ['OPTIMIZED', 300n],
                    ['PREVIEW', 40n],
                    ['THUMBNAIL', 10n],
                    ['BLUR_PLACEHOLDER', 5n],
                ],
                [
                    ['ORIGINAL', 100n],
                    ['OPTIMIZED', 150n],
                ],
                [['ORIGINAL', 1000n]],
                [
                    ['ORIGINAL', 500n],
                    ['OPTIMIZED', 100n],
                ],
                [['OPTIMIZED', 30n]],
                [],
            ].entries()) {
                const media = await client.media.create({
                    data: {
                        type: 'IMAGE',
                        originalFilename: 'photo.jpg',
                        mimeType: 'image/jpeg',
                        extension: 'jpg',
                        // Deliberately differs: storage statistics must use persisted objects.
                        fileSize: 9999n,
                        ...(index === 3 ? { deletedAt: new Date() } : {}),
                    },
                });
                for (const [n, [type, fileSize]] of variants.entries()) {
                    await client.mediaVariant.create({
                        data: {
                            mediaId: media.id,
                            type,
                            fileSize,
                            name: `variant-${n}`,
                            format: 'webp',
                            storageKey: `${media.id}/${n}`,
                        },
                    });
                }
            }
            expect(await createStorageStatisticsModule({ client }).service.getStatistics()).toMatchObject({
                objectCount: 12,
                originalBytes: '9007199254742593',
                optimizedBytes: '780',
                variantBytes: '835',
                totalBytes: '9007199254743428',
                estimatedSavedBytes: '9007199254740893',
            });
        });
    });
});
