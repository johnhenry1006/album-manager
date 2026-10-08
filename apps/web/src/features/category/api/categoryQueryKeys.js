export const categoryQueryKeys = {
  all: ['category'],
  lists: () => ['category', 'lists'],
  list: (params) => ['category', 'lists', params],
  tree: () => ['category', 'tree'],
};
