import { getHealth } from '../services/health.service.js';

export function createHealthController({ version }) {
    return async function healthController() {
        return getHealth({ version });
    };
}
