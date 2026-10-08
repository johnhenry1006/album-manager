export const mediaQueryKeys = {
  all: ['media'],
  lists: () => ['media', 'lists'],
  infinite: (collection, filters) => ['media', 'lists', collection, filters],
  detail: (mediaId) => ['media', 'detail', mediaId],
};
