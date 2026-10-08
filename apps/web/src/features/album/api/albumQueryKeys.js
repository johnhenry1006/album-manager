export const albumQueryKeys = {
  all: ['album'],
  lists: () => ['album', 'lists'],
  list: (params) => ['album', 'lists', params],
  detail: (albumId) => ['album', 'detail', albumId],
  media: (albumId) => ['album', 'media', albumId],
  mediaCollections: () => ['album', 'media'],
  infiniteMedia: (albumId, params) => ['album', 'media', albumId, params],
};
