import { EventEmitter } from 'node:events';

import { expect, it } from 'vitest';

import { buildApp } from './authenticatedApp.testUtils.js';
import { registerShutdown } from './registerShutdown.js';

it.each(['SIGINT', 'SIGTERM'])('closes the app once on %s and removes signal handlers', async (signal) => {
    const runtime = new EventEmitter();
    const app = buildApp({ logger: false });
    let closes = 0;
    app.addHook('onClose', async () => {
        closes += 1;
    });
    registerShutdown(app, { runtime, timeoutMs: 1000 });
    await app.ready();
    runtime.emit(signal);
    runtime.emit(signal);
    await app.close();
    expect(closes).toBe(1);
    expect(runtime.listenerCount('SIGINT')).toBe(0);
    expect(runtime.listenerCount('SIGTERM')).toBe(0);
    expect(runtime.exitCode).toBeUndefined();
});

it('marks shutdown failure as unsuccessful without leaving signal listeners', async () => {
    const runtime = new EventEmitter();
    const app = buildApp({ logger: false });
    app.addHook('onClose', async () => {
        throw new Error('close hook failed');
    });
    registerShutdown(app, { runtime, timeoutMs: 1000 });
    await app.ready();
    runtime.emit('SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));
    expect(runtime.exitCode).toBe(1);
    expect(runtime.listenerCount('SIGINT')).toBe(0);
    expect(runtime.listenerCount('SIGTERM')).toBe(0);
});
