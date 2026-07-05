import { describe, expect, it } from 'vitest';

import { EmailValidationService } from '../src/domain/email-validation-service';

describe('EmailValidationService', () => {
    it('rejects invalid email format', async () => {
        const service = new EmailValidationService('off');

        const result = await service.validate('not-an-email');

        expect(result.ok).toBe(false);
        expect(result.message).toContain('valid email address format');
    });

    it('accepts unreachable domain in warn mode with warning', async () => {
        const service = new EmailValidationService('warn', async () => false);

        const result = await service.validate('user@example.invalid');

        expect(result.ok).toBe(true);
        expect(result.warning).toContain('could not be verified');
        expect(result.normalizedEmail).toBe('user@example.invalid');
    });

    it('rejects unreachable domain in strict mode', async () => {
        const service = new EmailValidationService('strict', async () => false);

        const result = await service.validate('user@example.invalid');

        expect(result.ok).toBe(false);
        expect(result.message).toContain('not reachable');
    });

    it('accepts reachable domain in strict mode', async () => {
        const service = new EmailValidationService('strict', async () => true);

        const result = await service.validate('USER@example.com');

        expect(result.ok).toBe(true);
        expect(result.normalizedEmail).toBe('user@example.com');
    });
});
