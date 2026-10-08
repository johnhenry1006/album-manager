export function registerShutdown(app, { timeoutMs, runtime = process }) {
    let shuttingDown = false;
    const handlers = new Map();
    const cleanup = () => {
        for (const [signal, handler] of handlers) runtime.removeListener(signal, handler);
    };
    async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        app.log.info({ signal }, 'Shutting down API');
        const timer = setTimeout(() => {
            app.log.error('API shutdown timed out');
            runtime.exit(1);
        }, timeoutMs);
        timer.unref();
        try {
            await app.close();
        } catch (error) {
            runtime.exitCode = 1;
            app.log.error({ err: error }, 'API shutdown failed');
        } finally {
            clearTimeout(timer);
            cleanup();
        }
    }
    for (const signal of ['SIGINT', 'SIGTERM']) {
        const handler = () => {
            void shutdown(signal);
        };
        handlers.set(signal, handler);
        runtime.on(signal, handler);
    }
    app.addHook('onClose', async () => {
        cleanup();
    });
    return cleanup;
}
