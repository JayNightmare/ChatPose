import crypto from 'node:crypto';
import os from 'node:os';

import type { HostTraits, SignupResult } from './models';

export class FingerprintService {
    public constructor(private readonly masterSecret: string) { }

    public collectTraits(): HostTraits {
        const interfaces = os.networkInterfaces();
        let ipAddress = 'unknown';
        let macAddress = 'unknown';

        for (const group of Object.values(interfaces)) {
            if (!group) {
                continue;
            }
            for (const detail of group) {
                if (detail.family === 'IPv4' && !detail.internal) {
                    ipAddress = detail.address;
                    if (detail.mac && detail.mac !== '00:00:00:00:00:00') {
                        macAddress = detail.mac;
                    }
                    break;
                }
            }
        }

        return {
            os: os.platform(),
            hostname: os.hostname(),
            ipAddress,
            macAddress,
            arch: os.arch(),
            release: os.release()
        };
    }

    public createSignupFingerprint(email: string): SignupResult {
        const normalizedEmail = email.trim().toLowerCase();
        const traits = this.collectTraits();
        const traitsHash = this.hashJson(traits);
        const fingerprint = this.hmac(`${normalizedEmail}:${traitsHash}`);
        const encryptedTraits = this.encryptJson(traits);

        return {
            email: normalizedEmail,
            fingerprint,
            traitsHash,
            encryptedTraits
        };
    }

    public verifyFingerprint(expected: string): boolean {
        const traitsHash = this.hashJson(this.collectTraits());
        const localFingerprint = this.hmac(`${traitsHash}`);
        const expectedFingerprint = expected.trim();

        return this.safeCompare(localFingerprint, expectedFingerprint);
    }

    public deriveLoginFingerprintFromTraits(): string {
        const traitsHash = this.hashJson(this.collectTraits());
        return this.hmac(`${traitsHash}`);
    }

    public deriveBoundFingerprint(email: string): string {
        const traitsHash = this.hashJson(this.collectTraits());
        return this.hmac(`${email.trim().toLowerCase()}:${traitsHash}`);
    }

    private hashJson(value: object): string {
        return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
    }

    private hmac(payload: string): string {
        return crypto.createHmac('sha256', this.masterSecret).update(payload).digest('hex');
    }

    private encryptJson(value: object): string {
        const key = crypto.createHash('sha256').update(this.masterSecret).digest();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, encrypted]).toString('base64');
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
