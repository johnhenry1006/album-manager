export function authError(statusCode = 401) {
    return Object.assign(new Error('Authentication request failed'), { statusCode });
}
