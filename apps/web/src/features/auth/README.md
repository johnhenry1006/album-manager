# Auth feature

Public exports: AuthProvider, RequireAuth, useAuth. Private API adapters call
login/me/logout through the generic HTTP transport. Application composition mounts
the provider under QueryProvider and guards the AppLayout route subtree. The login
page consumes public auth actions through its page hook.

The feature uses query-client session reads with cancellation, memory-only CSRF
headers, generation-fenced responses and focus refresh. Login/logout suspend focus
refreshes; logout, expiry and identity changes clear business queries before another
identity is exposed. Generic transport callbacks receive headers/version/401 events
without importing auth. Presigned storage PUTs do not receive API cookie/CSRF behavior.

See [Auth API](../../../../../docs/api/AUTH.md) for provisioning and deployment.
