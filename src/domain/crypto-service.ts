import crypto from 'node:crypto';

import type { ChatMessage, FileChunkEnvelope, MessageEnvelope } from './models';

export class CryptoService {
    private readonly protocolVersion = '1.0.0';
    private readonly fileChunkSize = 16 * 1024;

    public createSessionKey(): Buffer {
        return crypto.randomBytes(32);
    }

    public encryptMessage(message: ChatMessage, sessionKey: Buffer): MessageEnvelope {
        const iv = crypto.randomBytes(12);
        const replayToken = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
        const encrypted = Buffer.concat([cipher.update(message.plainText, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        const cipherBlob = Buffer.concat([authTag, encrypted]).toString('base64');

        const payloadToSign = `${message.sessionId}:${timestamp}:${replayToken}:${cipherBlob}`;
        const signature = crypto.createHmac('sha256', sessionKey).update(payloadToSign).digest('hex');

        return {
            version: this.protocolVersion,
            sessionId: message.sessionId,
            nonce: iv.toString('base64'),
            cipherText: cipherBlob,
            signature,
            timestamp,
            replayToken
        };
    }

    public decryptMessage(envelope: MessageEnvelope, sessionKey: Buffer): string {
        const payloadToSign = `${envelope.sessionId}:${envelope.timestamp}:${envelope.replayToken}:${envelope.cipherText}`;
        const expectedSignature = crypto
            .createHmac('sha256', sessionKey)
            .update(payloadToSign)
            .digest('hex');

        if (!this.safeCompare(expectedSignature, envelope.signature)) {
            throw new Error('Envelope signature mismatch.');
        }

        const iv = Buffer.from(envelope.nonce, 'base64');
        const blob = Buffer.from(envelope.cipherText, 'base64');
        const authTag = blob.subarray(0, 16);
        const cipherText = blob.subarray(16);

        const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
        decipher.setAuthTag(authTag);

        const plainText = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
        return plainText;
    }

    public encryptFileData(sessionId: string, bytes: Buffer, sessionKey: Buffer): FileChunkEnvelope[] {
        if (bytes.length === 0) {
            return [];
        }

        const totalChunks = Math.ceil(bytes.length / this.fileChunkSize);
        const envelopes: FileChunkEnvelope[] = [];

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
            const start = chunkIndex * this.fileChunkSize;
            const end = Math.min(start + this.fileChunkSize, bytes.length);
            const chunk = bytes.subarray(start, end);

            const iv = crypto.randomBytes(12);
            const replayToken = crypto.randomUUID();
            const timestamp = new Date().toISOString();

            const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
            const encrypted = Buffer.concat([cipher.update(chunk), cipher.final()]);
            const authTag = cipher.getAuthTag();
            const cipherBlob = Buffer.concat([authTag, encrypted]).toString('base64');

            const payloadToSign = `${sessionId}:${chunkIndex}:${totalChunks}:${timestamp}:${replayToken}:${cipherBlob}`;
            const signature = crypto.createHmac('sha256', sessionKey).update(payloadToSign).digest('hex');

            envelopes.push({
                sessionId,
                chunkIndex,
                totalChunks,
                nonce: iv.toString('base64'),
                cipherText: cipherBlob,
                signature,
                replayToken,
                timestamp
            });
        }

        return envelopes;
    }

    public decryptFileData(envelopes: FileChunkEnvelope[], sessionKey: Buffer): Buffer {
        const chunks = [...envelopes].sort((a, b) => a.chunkIndex - b.chunkIndex).map((envelope) => {
            const payloadToSign = `${envelope.sessionId}:${envelope.chunkIndex}:${envelope.totalChunks}:${envelope.timestamp}:${envelope.replayToken}:${envelope.cipherText}`;
            const expectedSignature = crypto.createHmac('sha256', sessionKey).update(payloadToSign).digest('hex');
            if (!this.safeCompare(expectedSignature, envelope.signature)) {
                throw new Error(`File chunk signature mismatch at chunk ${envelope.chunkIndex}.`);
            }

            const iv = Buffer.from(envelope.nonce, 'base64');
            const blob = Buffer.from(envelope.cipherText, 'base64');
            const authTag = blob.subarray(0, 16);
            const cipherText = blob.subarray(16);

            const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
            decipher.setAuthTag(authTag);
            return Buffer.concat([decipher.update(cipherText), decipher.final()]);
        });

        return Buffer.concat(chunks);
    }

    private safeCompare(a: string, b: string): boolean {
        const left = Buffer.from(a);
        const right = Buffer.from(b);
        if (left.length !== right.length) {
            return false;
        }
        return crypto.timingSafeEqual(left, right);
    }
}
