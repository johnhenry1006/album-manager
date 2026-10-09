import { semanticError } from '../validators/semantic.validator.js';

// Providers should honor signal to cancel network/model work after the deadline.
export async function callSemanticProvider(run) {
    const controller = new AbortController();
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(() => run(controller.signal)),
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(semanticError(503, 'Semantic provider timed out'));
                }, 30000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
