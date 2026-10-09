import { assignmentField, validateAssignment } from '../validators/taxonomyAssignment.validator.js';
import { notFound, taxonomyWrite } from './taxonomy.errors.js';

export function createTaxonomyAssignments({ repository, kind }) {
    async function assign(input, mediaId) {
        const data = validateAssignment(input, kind, mediaId);
        const entityIds = data[assignmentField(kind)];
        return taxonomyWrite(() =>
            repository.transaction(async (tx) => {
                await tx.lock();
                // Stable order for all callers avoids deadlocks on overlapping media batches.
                const liveIds = await tx.lockMedia(data.mediaIds);
                if (liveIds.length !== data.mediaIds.length) throw notFound('Media');
                if ((await tx.findEntityIds(entityIds)).length !== entityIds.length) throw notFound(kind);
                await tx.assign(data.mediaIds, entityIds);
                return data;
            }),
        );
    }
    return {
        assignMedia: (mediaId, input) => assign(input, mediaId),
        assignBatch: (input) => assign(input),
    };
}
