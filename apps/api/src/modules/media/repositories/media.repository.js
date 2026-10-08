import { MediaDomainError, notFound } from '../services/media.errors.js';
import { mediaWrite } from './mediaWrite.js';

export function createMediaRepository(client) {
    async function write(operation) {
        try {
            return await mediaWrite(client, operation);
        } catch (error) {
            if (error.code === 'P2025') throw notFound();
            if (error.code === 'P2002') {
                throw new MediaDomainError('MEDIA_CONFLICT', 'Media already exists', 409);
            }
            throw error;
        }
    }
    return Object.freeze({
        create(data) {
            return write(() => client.media.create({ data }));
        },
        update(id, data) {
            return write(() => client.media.update({ where: { id, deletedAt: null }, data }));
        },
        findById(id, { includeDeleted = false } = {}) {
            return client.media.findUnique({ where: { id, ...(includeDeleted ? {} : { deletedAt: null }) } });
        },
        findByChecksum(checksum, { includeDeleted = false, excludeMediaId } = {}) {
            return client.media.findFirst({
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                where: {
                    checksum,
                    ...(includeDeleted ? {} : { deletedAt: null }),
                    ...(excludeMediaId === undefined ? {} : { id: { not: excludeMediaId } }),
                },
            });
        },
    });
}
