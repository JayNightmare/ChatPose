import { describe, expect, it } from 'vitest';

import { CryptoService } from '../src/domain/crypto-service';

describe('CryptoService', () => {
    it('encrypts and decrypts chat messages', () => {
        const service = new CryptoService();
        const sessionKey = service.createSessionKey();

        const envelope = service.encryptMessage(
            {
                sessionId: 'session-1',
                fromPeer: 'alice',
                toPeer: 'bob',
                plainText: 'hello secure world'
            },
            sessionKey
        );

        const plainText = service.decryptMessage(envelope, sessionKey);
        expect(plainText).toBe('hello secure world');
        expect(envelope.signature.length).toBeGreaterThan(0);
    });

    it('rejects tampered envelope signatures', () => {
        const service = new CryptoService();
        const sessionKey = service.createSessionKey();

        const envelope = service.encryptMessage(
            {
                sessionId: 'session-2',
                fromPeer: 'alice',
                toPeer: 'bob',
                plainText: 'do not tamper'
            },
            sessionKey
        );

        envelope.signature = `${envelope.signature.slice(0, -1)}0`;

        expect(() => service.decryptMessage(envelope, sessionKey)).toThrow('Envelope signature mismatch.');
    });

    it('encrypts and decrypts file chunks', () => {
        const service = new CryptoService();
        const sessionKey = service.createSessionKey();
        const data = Buffer.from('This is a sample file payload for encrypted chunk transport.');

        const chunks = service.encryptFileData('session-3', data, sessionKey);
        const restored = service.decryptFileData(chunks, sessionKey);

        expect(chunks.length).toBeGreaterThan(0);
        expect(restored.toString('utf8')).toBe(data.toString('utf8'));
    });
});
