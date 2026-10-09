import { buildApp as buildApplication } from './app.js';
export const TEST_ACTOR = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };
export function buildApp(options = {}) {
    const app = buildApplication({
        ...options,
        authService: {
            async authenticate() {
                return { user: TEST_ACTOR, csrfToken: 'test-csrf' };
            },
        },
    });
    const inject = app.inject.bind(app);
    app.inject = (input, ...rest) => {
        const request = typeof input === 'string' ? { url: input } : input;
        return inject({ ...request, headers: { 'x-csrf-token': 'test-csrf', ...request.headers } }, ...rest);
    };
    return app;
}
