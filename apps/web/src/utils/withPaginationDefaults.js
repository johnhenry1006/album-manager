/** Keep omitted values out of query keys and align keys with request defaults. */
export function withPaginationDefaults(filters, defaultLimit) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null),
  );
  return { page: 1, limit: defaultLimit, ...params };
}
