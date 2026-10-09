// Only origins may contribute a display host; signed URLs and credentials are rejected.
export function safeEndpointHost(endpoint) {
    try {
        const url = new URL(endpoint);
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== '/'
        )
            return null;
        return url.host;
    } catch {
        return null;
    }
}

export function mapStorageProviderMetadata(metadata = {}) {
    const { providerType, endpointHost, bucketName } = metadata ?? {};
    const safeHost = typeof endpointHost === 'string' && safeEndpointHost(`https://${endpointHost}`) === endpointHost;
    const safeBucket =
        typeof bucketName === 'string' &&
        /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName) &&
        !bucketName.includes('..') &&
        !/^\d+\.\d+\.\d+\.\d+$/.test(bucketName);
    return {
        providerType:
            typeof providerType === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(providerType) ? providerType : null,
        endpointHost: safeHost ? endpointHost : null,
        bucketName: safeBucket ? bucketName : null,
    };
}
