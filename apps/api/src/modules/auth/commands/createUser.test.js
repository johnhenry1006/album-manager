import { Readable } from 'node:stream';

import { expect, it } from 'vitest';

import { provisionFromInput } from './createUser.js';
it('takes passwords from bounded stdin, preserving spaces and removing only the line ending', async () => {
    let received;
    await provisionFromInput({
        email: 'a@example.com',
        input: Readable.from(['  a very long password  \n']),
        service: {
            provision(input) {
                received = input;
                return { id: 'a' };
            },
        },
    });
    expect(received).toEqual({ email: 'a@example.com', password: '  a very long password  ' });
    await expect(
        provisionFromInput({ email: 'a@example.com', input: Readable.from(['a'.repeat(515)]), service: {} }),
    ).rejects.toThrow('Invalid password input');
});
