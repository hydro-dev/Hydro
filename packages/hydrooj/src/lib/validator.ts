import { ValidationError } from '../error';

const RE_UID = /^-?\d+$/i;
const RE_DOMAINID = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/i;
const RE_PID = /^[a-zA-Z]+[a-zA-Z0-9]*$/i;
const RE_ROLE = /^[_0-9A-Za-z]{1,31}$/i;
const RE_MAIL = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/i;

export const isTitle = (s) => typeof s === 'string' && s.trim().length && s.trim().length < 64;
export const checkTitle = (s) => { if (!(s?.trim()?.length && s.trim().length < 64)) throw new ValidationError('title'); else return s; };
export const isDomainId = (s) => RE_DOMAINID.test(s);
export const checkDomainId = (s) => { if (!isDomainId(s)) throw new ValidationError('domainId'); else return s; };
export const isUid = (s) => RE_UID.test(s);
export const checkUid = (s) => { if (!isUid(s)) throw new ValidationError('uid'); else return s; };
export const isRole = (s) => RE_ROLE.test(s);
export const checkRole = (s) => { if (!isRole(s)) throw new ValidationError('role'); else return s; };
export const isPassword = (s) => s.length >= 5;
export const checkPassword = (s) => { if (!(s && s.length >= 5)) throw new ValidationError('password'); else return s; };
export const isEmail = (s) => RE_MAIL.test(s);
export const checkEmail = (s) => { if (!RE_MAIL.test(s)) throw new ValidationError('mail'); else return s; };
export const isContent = (s: any) => s && s.length < 65536;
export const checkContent = (s) => { if (!(s && s.length < 65536)) throw new ValidationError('content'); else return s; };
export const isPid = (s) => RE_PID.test(s.toString());
export const checkPid = (s) => { if (!RE_PID.test(s)) throw new ValidationError('pid'); else return s; };
export const isIntro = () => true;
export const checkIntro = (s) => { if (!isIntro()) throw new ValidationError('intro'); else return s; };

export const parsePid = (s) => (Number.isNaN(+s) ? s : `P${s}`);

global.Hydro.lib.validator = {
    isTitle,
    checkTitle,
    isDomainId,
    checkDomainId,
    isUid,
    checkUid,
    isRole,
    checkRole,
    isPassword,
    checkPassword,
    isEmail,
    checkEmail,
    isContent,
    checkContent,
    isPid,
    checkPid,
    isIntro,
    checkIntro,

    parsePid,
};
