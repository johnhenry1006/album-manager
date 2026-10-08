export default {
    test: {
        environment: 'node',
        include: ['src/**/*.test.js'],
        clearMocks: true,
        restoreMocks: true,
    },
};
