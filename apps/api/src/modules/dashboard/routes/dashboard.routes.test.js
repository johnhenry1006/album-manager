import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app/authenticatedApp.testUtils.js';

describe('GET /api/dashboard', () => {
    let app;
    afterEach(async () => app?.close());

    it('returns the dashboard service response', async () => {
        app = buildApp({ logger: false, dashboardService: { summary: async () => ({ counts: { media: 12 } }) } });
        const response = await app.inject('/api/dashboard');
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ counts: { media: 12 } });
    });

    it('rejects unsupported query parameters before reading the dashboard', async () => {
        const summary = vi.fn();
        app = buildApp({ logger: false, dashboardService: { summary } });
        const response = await app.inject('/api/dashboard?limit=100000');
        expect(response.statusCode).toBe(400);
        expect(summary).not.toHaveBeenCalled();
    });

    it('uses centralized errors without exposing database details', async () => {
        app = buildApp({
            logger: false,
            dashboardService: {
                summary: async () => {
                    throw new Error('private SQL');
                },
            },
        });
        const response = await app.inject('/api/dashboard');
        expect(response.statusCode).toBe(500);
        expect(response.body).not.toContain('private SQL');
        expect(response.json()).toMatchObject({ requestId: expect.any(String) });
    });
});
