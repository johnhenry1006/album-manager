import { MediaDomainError, notFound } from '../services/media.errors.js';
import { mediaWrite } from './mediaWrite.js';

async function write(client, operation) {
    try {
        return await mediaWrite(client, operation);
    } catch (error) {
        if (error.code === 'P2025' || error.code === 'P2003') throw notFound('Media or variant');
        if (error.code === 'P2002')
            throw new MediaDomainError('VARIANT_CONFLICT', 'Variant identity or storage key already exists', 409);
        throw error;
    }
}

export function createMediaVariantRepository(client) {
    function register(data) {
        // Lock/recheck the parent for every rendition, including concurrent soft deletion.
        // ORIGINAL checks cover every format while holding the same parent lock.
        const persist = async (transaction) => {
            const parents = await transaction.$queryRaw`
                SELECT id FROM media WHERE id = ${data.mediaId}::uuid AND deleted_at IS NULL FOR UPDATE
            `;
            if (!parents.length) throw notFound();
            if (data.type === 'ORIGINAL') {
                const original = await transaction.mediaVariant.findFirst({
                    where: { mediaId: data.mediaId, type: 'ORIGINAL' },
                });
                if (original) throw new MediaDomainError('ORIGINAL_EXISTS', 'Original variant already registered', 409);
            }
            return transaction.mediaVariant.create({ data });
        };
        return write(client, () =>
            typeof client.$transaction === 'function' ? client.$transaction(persist) : persist(client),
        );
    }
    return Object.freeze({
        create: register,
        createOriginal: register,
        update(id, data) {
            return write(client, () =>
                client.mediaVariant.update({
                    where: { id, type: { not: 'ORIGINAL' }, media: { deletedAt: null } },
                    data,
                }),
            );
        },
        findById(id) {
            return client.mediaVariant.findUnique({ where: { id, media: { deletedAt: null } } });
        },
        findByIdentity({ mediaId, type, format, name }) {
            return client.mediaVariant.findUnique({
                where: { mediaId_type_format_name: { mediaId, type, format, name }, media: { deletedAt: null } },
            });
        },
    });
}
