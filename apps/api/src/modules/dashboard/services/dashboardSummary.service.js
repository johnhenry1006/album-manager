// Instance-local cache boundary. A shared cache or materialized summary can
// replace this reader without changing HTTP, recent-list queries, or mapping.
export function createDashboardSummaryReader({ repository, now = Date.now }) {
    const ttlMs = 30000;
    let cached;
    let expiresAt = 0;
    let refresh;

    return async function readSummary() {
        if (cached && now() < expiresAt) return cached;
        if (!refresh) {
            refresh = (async () => {
                try {
                    const data = await repository.readAggregates();
                    const updatedAt = new Date(now());
                    cached = { data, updatedAt };
                    expiresAt = updatedAt.getTime() + ttlMs;
                    return cached;
                } finally {
                    refresh = undefined;
                }
            })();
        }
        return refresh;
    };
}
