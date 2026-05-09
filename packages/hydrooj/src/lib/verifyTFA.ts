import { Secret, TOTP } from 'otpauth';

export function verifyTFA(secret: string, code?: string) {
    if (!code || !code.length) return false;
    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
    return totp.validate({ token: code.replace(/\W+/g, '') }) !== null;
}
