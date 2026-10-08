// Detection and checksum reservation share a short database transaction. This
// prevents two different uploads from both passing detection for the same bytes.
export function createMediaDuplicateGateService({ withChecksumLock }) {
    return Object.freeze({
        check({ mediaId, uploadFileId, checksum, allowDuplicate }) {
            return withChecksumLock(checksum, async ({ mediaService, duplicateDetectionService, admissionService }) => {
                const admitted = await admissionService.load(mediaId, uploadFileId);
                const duplicate = await duplicateDetectionService.detectDuplicateByChecksum(checksum, {
                    excludeMediaId: mediaId,
                });
                if (admitted || duplicate.type === 'NEW_MEDIA' || allowDuplicate) {
                    await mediaService.updateMetadata(mediaId, { checksum });
                    if (!admitted) await admissionService.accept(uploadFileId);
                }
                return { ...duplicate, admitted };
            });
        },
    });
}
