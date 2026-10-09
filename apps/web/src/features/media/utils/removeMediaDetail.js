import { mediaQueryKeys } from '../api/mediaQueryKeys.js';

/** Clear signed detail data from active observers before removing inactive cache. */
export async function removeMediaDetail(client, mediaId) {
  const queryKey = mediaQueryKeys.detail(mediaId);
  await client.cancelQueries({ queryKey, exact: true });
  client.setQueryData(queryKey, null);
  client.removeQueries({ queryKey, exact: true, type: 'inactive' });
}
