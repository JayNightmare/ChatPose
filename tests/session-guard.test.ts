import { describe, expect, it } from 'vitest';

import { SessionGuard } from '../src/domain/session-guard';

describe('SessionGuard', () => {
    it('blocks binding to a second remote peer without disconnect', () => {
        const guard = new SessionGuard();

        guard.bind('s1', 'local-peer', 'remote-a');
        expect(() => guard.bind('s2', 'local-peer', 'remote-b')).toThrow(
            'Only one remote peer is permitted in an active secure session.'
        );
    });

    it('rejects duplicate replay tokens', () => {
        const guard = new SessionGuard();
        const now = new Date().toISOString();

        guard.assertReplayTokenUnique('token-1', now);
        expect(() => guard.assertReplayTokenUnique('token-1', now)).toThrow(
            'Replay token already seen in this runtime.'
        );
    });
});
