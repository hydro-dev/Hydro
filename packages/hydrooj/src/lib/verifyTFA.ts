import notp from 'notp';
import b32 from 'thirty-two';

export function verifyTFA(secret: string, code?: string) {
    if (!code || !code.length) return null;
    const bin = b32.decode(secret);
    return notp.totp.verify(code.replace(/\W+/g, ''), bin);
}
