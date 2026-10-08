import { createHash } from 'node:crypto';

import { invalid } from './media.errors.js';

// Hash original encoded bytes, never resized/optimized bytes or an S3 ETag.
// Async byte iterables (including Node streams) avoid buffering whole originals.
export async function calculateMediaChecksum(source) {
    const hash = createHash('sha256');
    if (source instanceof Uint8Array) {
        hash.update(source);
    } else if (source && typeof source[Symbol.asyncIterator] === 'function') {
        for await (const chunk of source) {
            if (!(chunk instanceof Uint8Array)) throw invalid('Expected original media byte chunks');
            hash.update(chunk);
        }
    } else {
        throw invalid('Expected original media bytes or an async byte stream');
    }
    return hash.digest('hex');
}
