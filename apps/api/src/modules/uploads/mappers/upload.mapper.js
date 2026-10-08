export function mapUploadFile(file) {
    return {
        uploadFileId: file.id,
        sessionId: file.uploadSessionId,
        status: file.status,
        filename: file.clientFilename,
        mimeType: file.mimeType,
        fileSize: file.fileSize.toString(),
        mediaId: file.mediaId ?? null,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
    };
}
export function mapUploadSession(session) {
    return {
        sessionId: session.id,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
        ...(session.files ? { files: session.files.map(mapUploadFile), nextCursor: session.nextCursor } : {}),
    };
}
