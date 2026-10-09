import { expect, it } from 'vitest';

import { validateTrashEnvironment } from './trash.js';
it('defaults retention to thirty days and accepts configured days', () => {
    expect(validateTrashEnvironment({})).toEqual({ retentionDays: 30 });
    expect(validateTrashEnvironment({ TRASH_RETENTION_DAYS: '7' })).toEqual({ retentionDays: 7 });
});
it.each(['', '0', '-1', '1.5', 'garbage', '36501', 30])('rejects invalid retention %j', (value) => {
    expect(() => validateTrashEnvironment({ TRASH_RETENTION_DAYS: value })).toThrow('TRASH_RETENTION_DAYS');
});
