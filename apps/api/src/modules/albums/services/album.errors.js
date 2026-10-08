export function albumError(statusCode, message) {
    return Object.assign(new Error(message), { statusCode });
}

export const invalid = (message) => albumError(400, message);
export const notFound = (entity = 'Album') => albumError(404, `${entity} not found`);

export async function albumWrite(run) {
    try {
        return await run();
    } catch (error) {
        if (error.code === 'P2002') throw albumError(409, 'Album slug is already in use');
        throw error;
    }
}
