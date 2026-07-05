import dns from 'node:dns/promises';

export type EmailCheckMode = 'off' | 'warn' | 'strict';

export type EmailValidationResult = {
    ok: boolean;
    normalizedEmail?: string;
    message?: string;
    warning?: string;
};

export type DomainReachabilityCheck = (domain: string) => Promise<boolean>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailValidationService {
    public constructor(
        private readonly mode: EmailCheckMode,
        private readonly domainCheck: DomainReachabilityCheck = isDomainReachable
    ) { }

    public async validate(rawEmail: string): Promise<EmailValidationResult> {
        const normalizedEmail = rawEmail.trim().toLowerCase();

        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            return {
                ok: false,
                message: 'Signup failed. Provide a valid email address format.'
            };
        }

        if (this.mode === 'off') {
            return {
                ok: true,
                normalizedEmail
            };
        }

        const domain = normalizedEmail.split('@')[1];
        const reachable = await this.domainCheck(domain);
        if (reachable) {
            return {
                ok: true,
                normalizedEmail
            };
        }

        if (this.mode === 'strict') {
            return {
                ok: false,
                message: `Signup failed. Email domain ${domain} is not reachable.`
            };
        }

        return {
            ok: true,
            normalizedEmail,
            warning: `Email domain ${domain} could not be verified. Continuing in warn mode.`
        };
    }
}

async function isDomainReachable(domain: string): Promise<boolean> {
    try {
        const mxRecords = await dns.resolveMx(domain);
        if (mxRecords.length > 0) {
            return true;
        }
    } catch {
        // fall through to A/AAAA checks
    }

    try {
        const aRecords = await dns.resolve(domain, 'A');
        if (aRecords.length > 0) {
            return true;
        }
    } catch {
        // continue to AAAA check
    }

    try {
        const aaaaRecords = await dns.resolve(domain, 'AAAA');
        return aaaaRecords.length > 0;
    } catch {
        return false;
    }
}
