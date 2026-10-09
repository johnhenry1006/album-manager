import { pathToFileURL } from 'node:url';

import { validateAuthEnvironment } from '#config/auth.js';
import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';
import { createDatabase } from '#infrastructure/database/index.js';

import { createAuthModule } from '../index.js';
export async function provisionFromInput({ email, input, service }) {
    let password = '';
    for await (const chunk of input) {
        password += chunk.toString();
        if (Buffer.byteLength(password) > 514) throw new Error('Invalid password input');
    }
    return service.provision({ email, password: password.replace(/\r?\n$/, '') });
}
async function main() {
    const environment = loadEnvironment();
    const database = createDatabase(validateDatabaseEnvironment(environment));
    try {
        if (process.stdin.isTTY || process.argv.length !== 3)
            throw new Error('Usage: auth:create-user EMAIL with password on stdin');
        await database.connect();
        const { service } = createAuthModule({ client: database.client, config: validateAuthEnvironment(environment) });
        await provisionFromInput({ email: process.argv[2], input: process.stdin, service });
        console.log('Account provisioned');
    } finally {
        await database.disconnect();
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    main().catch(() => {
        console.error('Account provisioning failed');
        process.exitCode = 1;
    });
