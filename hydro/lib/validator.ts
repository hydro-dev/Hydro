import { ValidationError } from '../error';

const RE_UID = /^-?\d+$/i;
const RE_PID = /^([a-zA-Z]+[a-zA-Z0-9]*)|$/i;
const RE_UNAME = /[^\s\u3000](.{,254}[^\s\u3000])?$/i;
const RE_ROLE = /^[_0-9A-Za-z]{1,256}$/i;
const RE_MAIL = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/i;

export const isTitle = (s) => s && s.length < 64;
export const checkTitle = (s) => { if (!isTitle(s)) throw new ValidationError('title'); else return s; };
export const isUid = (s) => RE_UID.test(s);
export const checkUid = (s) => { if (!isUid(s)) throw new ValidationError('uid'); else return s; };
export const isUname = (s) => RE_UNAME.test(s);
export const checkUname = (s) => { if (!isUname(s)) throw new ValidationError('uname'); else return s; };
export const isRole = (s) => RE_ROLE.test(s);
export const checkRole = (s) => { if (!isRole(s)) throw new ValidationError('role'); else return s; };
export const isPassword = (s) => s.length >= 5;
export const checkPassword = (s) => { if (!isPassword(s)) throw new ValidationError('password'); else return s; };
export const isEmail = (s) => RE_MAIL.test(s);
export const checkEmail = (s) => { if (!isEmail(s)) throw new ValidationError('mail'); else return s; };
export const isContent = (s) => s && s.length < 65536;
export const checkContent = (s) => { if (!isContent(s)) throw new ValidationError('content'); else return s; };
export const isName = (s) => s && s.length < 256;
export const checkName = (s) => { if (!isName(s)) throw new ValidationError('name'); else return s; };
export const isPid = (s) => RE_PID.test(s.toString());
export const checkPid = (s) => { if (!RE_PID.test(s)) throw new ValidationError('pid'); else return s; };
export const isIntro = () => true;
export const checkIntro = (s) => { if (!isIntro()) throw new ValidationError('intro'); else return s; };
export const isDescription = () => true;
export const checkDescription = (s) => { if (!isDescription()) throw new ValidationError('description'); else return s; };

global.Hydro.lib.validator = {
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
