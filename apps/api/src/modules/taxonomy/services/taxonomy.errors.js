export const taxonomyError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
export const invalid = (message) => taxonomyError(400, message);
export const notFound = (entity) => taxonomyError(404, `${entity} not found`);

export async function taxonomyWrite(run) {
    try {
        return await run();
    } catch (error) {
        if (error.code === 'P2002') throw taxonomyError(409, 'Slug is already in use');
        if (error.code === 'P2003') throw taxonomyError(409, 'Taxonomy reference conflict');
        if (error.code === 'P2025') throw notFound('Taxonomy');
        throw error;
    }
}
