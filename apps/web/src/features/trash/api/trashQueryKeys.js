export const trashQueryKeys = {
  all: ['trash'],
  lists: () => ['trash', 'lists'],
  infinite: (params) => ['trash', 'lists', params],
};
