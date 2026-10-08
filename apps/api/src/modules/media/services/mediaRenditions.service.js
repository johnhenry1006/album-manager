import { generateStorageKey } from '#infrastructure/storage/index.js';

import { invalid } from './media.errors.js';
import { calculateMediaChecksum } from './mediaChecksum.service.js';

export function createMediaRenditionsService({ storage, mediaVariantService }) {
    return Object.freeze({
        async persist(media, original, variants) {
            for (const variant of variants) {
                if (variant.type === 'ORIGINAL') throw invalid('Cannot generate an original variant');
                await mediaVariantService.withMediaLock(media.id, async (scopedVariants) => {
                    const identity = {
                        mediaId: media.id,
                        type: variant.type,
                        format: variant.format,
                        name: variant.name,
                    };
                    const existing = await scopedVariants.findByIdentity(identity);
                    if (existing?.storageKey === original.storageKey)
                        throw invalid('Derivative cannot overwrite original');
                    if (existing && (await storage.exists({ key: existing.storageKey }))) return;
                    // Content-addressed, separate derivative keys also recover objects uploaded
                    // before a database failure; changed settings cannot corrupt a prior object.
                    const digest = await calculateMediaChecksum(variant.data);
                    const key = generateStorageKey({
                        id: media.id,
                        createdAt: media.createdAt,
                        variant: variant.type,
                        filename: `${variant.name}-${digest}.${variant.format}`,
                    });
                    if (key === original.storageKey) throw invalid('Derivative cannot overwrite original');
                    if (!(await storage.exists({ key }))) {
                        await storage.upload({
                            key,
                            body: variant.data,
                            contentType: variant.contentType,
                            contentLength: variant.fileSize,
                        });
                    }
                    const asset = {
                        storageKey: key,
                        fileSize: variant.fileSize,
                        width: variant.width,
                        height: variant.height,
                        quality: variant.quality,
                    };
                    if (existing) {
                        await scopedVariants.update(existing.id, asset);
                    } else {
                        try {
                            await scopedVariants.create({ ...identity, ...asset });
                        } catch (error) {
                            // A stalled BullMQ attempt may overlap a retry. The winner owns
                            // this rendition; unrelated storage/identity conflicts still fail.
                            if (error.code !== 'VARIANT_CONFLICT' || !(await scopedVariants.findByIdentity(identity)))
                                throw error;
                        }
                    }
                });
            }
        },
    });
}
