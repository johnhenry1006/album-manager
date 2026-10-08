export function getHealth({ version }) {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        ...(version ? { version } : {}),
    };
}
