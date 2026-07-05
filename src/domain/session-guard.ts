type SessionBinding = {
    sessionId: string;
    localPeerId: string;
    remotePeerId: string;
};

export class SessionGuard {
    private activeBinding: SessionBinding | null = null;
    private readonly replayTokens = new Map<string, number>();

    public bind(sessionId: string, localPeerId: string, remotePeerId: string): SessionBinding {
        if (
            this.activeBinding &&
            (this.activeBinding.remotePeerId !== remotePeerId || this.activeBinding.localPeerId !== localPeerId)
        ) {
            throw new Error('Only one remote peer is permitted in an active secure session.');
        }

        this.activeBinding = {
            sessionId,
            localPeerId,
            remotePeerId
        };

        return this.activeBinding;
    }

    public clear(): void {
        this.activeBinding = null;
    }

    public getBinding(): SessionBinding | null {
        return this.activeBinding;
    }

    public assertOutbound(remotePeerId: string): void {
        if (!this.activeBinding) {
            throw new Error('No active secure session binding.');
        }
        if (this.activeBinding.remotePeerId !== remotePeerId) {
            throw new Error('Outbound peer does not match active 1:1 session binding.');
        }
    }

    public assertReplayTokenUnique(replayToken: string, timestamp: string): void {
        this.cleanupExpiredTokens();

        if (this.replayTokens.has(replayToken)) {
            throw new Error('Replay token already seen in this runtime.');
        }

        const issuedAt = Date.parse(timestamp);
        const ttlMs = 10 * 60 * 1000;
        this.replayTokens.set(replayToken, Number.isNaN(issuedAt) ? Date.now() + ttlMs : issuedAt + ttlMs);
    }

    private cleanupExpiredTokens(): void {
        const now = Date.now();
        for (const [token, expiresAt] of this.replayTokens.entries()) {
            if (expiresAt <= now) {
                this.replayTokens.delete(token);
            }
        }
    }
}
