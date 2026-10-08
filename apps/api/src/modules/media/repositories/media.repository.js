import { MediaDomainError, notFound } from '../services/media.errors.js';
import { mediaWrite } from './mediaWrite.js';

export function createMediaRepository(client) {
    async function write(operation, data) {
        try {
            return await mediaWrite(client, operation);
        } catch (error) {
            if (error.code === 'P2025') throw notFound();
            if (error.code === 'P2002') {
                // Lookup also covers adapter versions whose target metadata is absent.
                // Deleted media still reserves its checksum; callers choose restore/reuse policy.
                const existingMedia = data.checksum
                    ? await client.media.findUnique({ where: { checksum: data.checksum } })
                    : null;
                if (existingMedia) {
                    throw new MediaDomainError('DUPLICATE_MEDIA', 'Checksum already belongs to media', 409, {
                        existingMedia,
                    });
                }
                throw new MediaDomainError('MEDIA_CONFLICT', 'Media already exists', 409);
            }
            throw error;
        }
    }
    return Object.freeze({
        create(data) {
            return write(() => client.media.create({ data }), data);
        },
        update(id, data) {
            return write(() => client.media.update({ where: { id, deletedAt: null }, data }), data);
        },
        findById(id, { includeDeleted = false } = {}) {
            return client.media.findUnique({ where: { id, ...(includeDeleted ? {} : { deletedAt: null }) } });
        },
        findByChecksum(checksum, { includeDeleted = false } = {}) {
            return client.media.findUnique({ where: { checksum, ...(includeDeleted ? {} : { deletedAt: null }) } });
        },
    });
}
