import { describe, expect, it } from 'vitest';

import { validateDatabaseEnvironment } from './database.js';

describe('database configuration', () => {
    it('prefers DATABASE_URL over local PostgreSQL settings', () => {
        const databaseUrl = 'postgresql://user:secret@db:5432/app?sslmode=require';
        expect(validateDatabaseEnvironment({ DATABASE_URL: databaseUrl, POSTGRES_PORT: 'bad' }).databaseUrl).toBe(
            databaseUrl,
        );
    });

    it('builds a URL from local settings with encoded credentials', () => {
        expect(validateDatabaseEnvironment({ POSTGRES_PASSWORD: 'p@ss:/?#' }).databaseUrl).toBe(
            'postgresql://album_manager:p%40ss%3A%2F%3F%23@localhost:5434/album_manager',
        );
    });

    it.each([
        {},
        { DATABASE_URL: '' },
        { DATABASE_URL: 'mysql://user:private@localhost/app' },
        { DATABASE_URL: 'postgresql://localhost' },
        { POSTGRES_PASSWORD: 'private', POSTGRES_PORT: '65536' },
        { POSTGRES_PASSWORD: 'private', POSTGRES_HOST: 'localhost/path' },
    ])('rejects missing or invalid settings without revealing credentials', (environment) => {
        expect(() => validateDatabaseEnvironment(environment)).toThrow(/Invalid database configuration:/);
        try {
            validateDatabaseEnvironment(environment);
        } catch (error) {
            expect(error.message).not.toContain('private');
        }
    });
});
