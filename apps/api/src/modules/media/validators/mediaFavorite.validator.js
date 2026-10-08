import { invalid } from '../services/media.errors.js';
import { validateId } from './media.validator.js';

export function validateMediaFavoriteRequest(id, query = {}, body) {
    validateId(id);
    if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).length)
        throw invalid('This endpoint does not accept query parameters');
    if (body !== undefined) throw invalid('This endpoint does not accept a request body');
    return id;
}
