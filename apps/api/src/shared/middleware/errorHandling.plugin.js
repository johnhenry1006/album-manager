import fastifyPlugin from 'fastify-plugin';

import { errorHandler } from '../errors/errorHandler.js';

async function errorHandling(app) {
    app.setErrorHandler(errorHandler);
    app.setNotFoundHandler((request, reply) => {
        const error = Object.assign(new Error('Route not found'), { statusCode: 404 });
        return errorHandler(error, request, reply);
    });
}

export default fastifyPlugin(errorHandling, { name: 'centralized-errors', fastify: '5.x' });
