/** status is the HTTP status, or 0 when no HTTP response is available. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN_ERROR', requestId = null, cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Preserve cancellation and normalize HTTP/network failures without exposing raw response bodies. */
export function normalizeApiError(error, { status = 0, payload } = {}) {
  if (error instanceof ApiError || error?.name === 'AbortError') return error;
  if (status > 0) {
    return new ApiError(nonEmptyString(payload?.message) ?? `Request failed (${status}).`, {
      status,
      code: nonEmptyString(payload?.error) ?? 'HTTP_ERROR',
      requestId: nonEmptyString(payload?.requestId),
      cause: error,
    });
  }
  return new ApiError('Unable to reach the API.', { code: 'NETWORK_ERROR', cause: error });
}
