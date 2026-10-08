import { mapMediaDetail, mapMediaDisplayVariant } from '../mappers/mediaDetail.mapper.js';
import { isSafeDisplayVariant, validateMediaDetailRequest } from '../validators/mediaDetail.validator.js';
import { notFound } from './media.errors.js';

export function createMediaDetailService({ repository, storage, config }) {
    async function sign(key, expiresIn) {
        // SigV4 timestamps have second precision; use an earlier conservative expiry.
        const issuedAt = Math.floor(Date.now() / 1000) * 1000;
        const { url } = await storage.createPresignedDownloadUrl({ key, expiresIn, method: 'GET' });
        return { url, method: 'GET', expiresIn, expiresAt: new Date(issuedAt + expiresIn * 1000).toISOString() };
    }
    return Object.freeze({
        async detail(id, query) {
            const record = await repository.findDetail(validateMediaDetailRequest(id, query));
            if (!record) throw notFound();
            const variants = await Promise.all(
                record.variants
                    .filter(isSafeDisplayVariant)
                    .map(async (variant) =>
                        mapMediaDisplayVariant(variant, await sign(variant.storageKey, config.displayUrlExpirySeconds)),
                    ),
            );
            return mapMediaDetail(record, variants);
        },
        async originalUrl(id, query) {
            const record = await repository.findOriginal(validateMediaDetailRequest(id, query));
            if (!record) throw notFound();
            const original = record.variants[0];
            if (!original) throw notFound('Original media variant');
            return sign(original.storageKey, config.originalUrlExpirySeconds);
        },
    });
}
