/* eslint-disable no-empty */
import { ValidationError } from '../error';

const RE_UID = /^-?\d+$/i;
const RE_PID = /^([a-zA-Z]+[a-zA-Z0-9]*)|$/i;
const RE_UNAME = /[^\s\u3000](.{,254}[^\s\u3000])?$/i;
const RE_ROLE = /^[_0-9A-Za-z]{1,256}$/i;
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
        if (scheme.$or instanceof Array) {
            for (const s of scheme.$or) {
                let success = false;
                try {
                    _validate(s, arg, base);
                    success = true;
                } catch { }
                // TODO beautify output
                if (!success) throw new ValidationError(scheme.$or);
            }
        } else {
            for (const skey in scheme.$or) {
                let success = false;
                try {
                    _validate(scheme.$or[skey], arg[skey], `${base}.${skey}`);
                    success = true;
                } catch { }
                // TODO beautify output
                if (!success) throw new ValidationError(base, scheme.$or);
            }
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

function descriptor(scheme: any): Function {
    return function desc(target: any, name: string, obj: any) {
        const originalMethod = obj.value;
        obj.value = function func(...args: any[]) {
            _validate(scheme, args[0], '');
            return originalMethod.call(this, ...args);
        };
        return obj;
    };
}

export function validate(scheme: any): Function;
export function validate(scheme: any, arg: any): void;
export function validate(...args: any[]): any {
    if (args.length === 1) return descriptor(args[0]);
    return _validate(args[0], args[1], '');
}

export const isTitle = (s) => s && s.length < 64;
export const checkTitle = (s) => { if (!(s && s.length < 64)) throw new ValidationError('title'); else return s; };
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

global.Hydro.lib.validator = {
    validate,
    isTitle,
    checkTitle,
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
};
/*
ID_RE = re.compile(r'[^\\/\s\u3000]([^\\/\n\r]*[^\\/\s\u3000])?')

def is_id(s):
  return bool(ID_RE.fullmatch(s))

def check_category_name(s):
  if not is_id(s):
    raise error.ValidationError('category_name')

def check_node_name(s):
  if not is_id(s):
    raise error.ValidationError('node_name')

def is_intro(s):
  return isinstance(s, str) and 0 < len(s.strip()) < 500

def check_intro(s):
  if not is_intro(s):
    raise error.ValidationError('intro')

def is_description(s):
  return isinstance(s, str) and len(s) < 65536

def check_description(s):
  if not is_description(s):
    raise error.ValidationError('description')

def is_lang(i):
  return i in export const ant.language.LANG_TEXTS

def check_lang(i):
  if not is_lang(i):
    raise error.ValidationError('lang')

*/
