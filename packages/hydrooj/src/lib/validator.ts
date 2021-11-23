import { ValidationError } from '../error';

const RE_UID = /^-?\d+$/i;
const RE_DOMAINID = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/i;
const RE_PID = /^[a-zA-Z]+[a-zA-Z0-9]*$/i;
const RE_UNAME = /^.{3,31}$/i;
const RE_ROLE = /^[_0-9A-Za-z]{1,31}$/i;
const RE_MAIL = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/i;

// eslint-disable-next-line consistent-return
function _validate(scheme: any, arg: any, base: string): void {
    if (!(scheme instanceof Object)) return _validate({ $type: scheme }, arg, base);
    if (scheme.$validate) {
        const result = scheme.$validate(arg);
        if (result === false) throw new ValidationError(base);
    }
    if (scheme.$group) _validate(scheme.$group, arg, base);
    if (scheme.$or) {
        for (const s of scheme.$or) {
            let success = false;
            try {
                _validate(s, arg, base);
                success = true;
            } catch { }
            // TODO beautify output
            if (!success) throw new ValidationError(scheme.$or);
        }
    }
    if (scheme.$and) for (const s of scheme.$and) _validate(s, arg, base);
    if (scheme.$type) {
        if (typeof scheme.$type === 'string') {
            if (!scheme.$type.endsWith('?')) {
                if (!typeof arg === scheme.$type) {
                    throw new ValidationError(base);
                }
            } else if (arg && !scheme.$type.includes(typeof arg)) {
                throw new ValidationError(base);
            }
        } else if (!(arg instanceof scheme.$type)) {
            throw new ValidationError(base);
        }
    }
    if (scheme.$eq && scheme.$eq !== arg) throw new ValidationError(base);
    if (scheme.$not && scheme.$not === arg) throw new ValidationError(base);
    if (scheme.$in && !(scheme.$in.includes(arg))) throw new ValidationError(base);
    if (scheme.$nin && scheme.$nin.includes(arg)) throw new ValidationError(base);
    for (const key in scheme) {
        if (key[0] !== '$') {
            if (arg instanceof Object) {
                _validate(scheme[key], arg[key], `${base}.${key}`);
            } else {
                throw new ValidationError(base);
            }
        }
    }
}

export function validate(scheme: any, arg: any) {
    return _validate(scheme, arg, '');
}

export const isTitle = (s) => s && s.length < 64;
export const checkTitle = (s) => { if (!(s && s.length < 64)) throw new ValidationError('title'); else return s; };
export const isDomainId = (s) => RE_DOMAINID.test(s);
export const checkDomainId = (s) => { if (!isDomainId(s)) throw new ValidationError('domainId'); else return s; };
export const isUid = (s) => RE_UID.test(s);
export const checkUid = (s) => { if (!isUid(s)) throw new ValidationError('uid'); else return s; };
export const isUname = (s) => RE_UNAME.test(s);
export const checkUname = (s) => { if (!isUname(s)) throw new ValidationError('uname'); else return s; };
export const isRole = (s) => RE_ROLE.test(s);
export const checkRole = (s) => { if (!isRole(s)) throw new ValidationError('role'); else return s; };
export const isPassword = (s) => s.length >= 5;
export const checkPassword = (s) => { if (!(s && s.length >= 5)) throw new ValidationError('password'); else return s; };
export const isEmail = (s) => RE_MAIL.test(s);
export const checkEmail = (s) => { if (!RE_MAIL.test(s)) throw new ValidationError('mail'); else return s; };
export const isContent = (s: any) => s && s.length < 65536;
export const checkContent = (s) => { if (!(s && s.length < 65536)) throw new ValidationError('content'); else return s; };
export const isName = (s) => s && s.length < 256;
export const checkName = (s) => { if (!isName(s)) throw new ValidationError('name'); else return s; };
export const isPid = (s) => RE_PID.test(s.toString());
export const checkPid = (s) => { if (!RE_PID.test(s)) throw new ValidationError('pid'); else return s; };
export const isIntro = () => true;
export const checkIntro = (s) => { if (!isIntro()) throw new ValidationError('intro'); else return s; };
export const isDescription = (s: any) => s && s.length < 65536;
export const checkDescription = (s) => { if (!(s && s.length < 65536)) throw new ValidationError('description'); else return s; };

export const parsePid = (s) => (Number.isNaN(+s) ? s : `P${s}`);

global.Hydro.lib.validator = {
    validate,
    isTitle,
    checkTitle,
    isDomainId,
    checkDomainId,
    isUid,
    checkUid,
    isUname,
    checkUname,
    isRole,
    checkRole,
    isPassword,
    checkPassword,
    isEmail,
    checkEmail,
    isContent,
    checkContent,
    isName,
    checkName,
    isPid,
    checkPid,
    isIntro,
    checkIntro,
    isDescription,
    checkDescription,

    parsePid,
};
