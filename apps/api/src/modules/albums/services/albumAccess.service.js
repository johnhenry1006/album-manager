import { notFound } from './album.errors.js';

export async function requireAlbum(repository, albumId, { lock = false } = {}) {
    const album = await (lock ? repository.lockAlbum(albumId) : repository.findAlbum(albumId));
    if (!album) throw notFound();
    return album;
}
