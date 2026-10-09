import { createAuthRepository } from './repositories/auth.repository.js';
import { createAuthService } from './services/auth.service.js';
export function createAuthModule({ client, config, clock }) {
    return { service: createAuthService({ repository: createAuthRepository(client), config, clock }) };
}
export { createAuthRepository, createAuthService };

export { authProtection } from './routes/auth.plugin.js';
export { authRoutes } from './routes/auth.routes.js';
