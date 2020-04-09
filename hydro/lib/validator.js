const
    { ValidationError } = require('../error'),
    RE_UID = /^-?\d+$/i,
    RE_PID = /^([a-zA-Z]+[a-zA-Z0-9]*)|$/i,
    RE_UNAME = /[^\s\u3000](.{,254}[^\s\u3000])?$/i,
    RE_MAIL = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/i;

const
    isTitle = s => s && s.length < 64,
    checkTitle = s => { if (!isTitle(s)) throw new ValidationError('title'); else return s; },
    isUid = s => RE_UID.test(s),
    checkUid = s => { if (!isUid(s)) throw new ValidationError('uid'); else return s; },
    isUname = s => RE_UNAME.test(s),
    checkUname = s => { if (!isUname(s)) throw new ValidationError('uname'); else return s; },
    isPassword = s => s.length >= 5,
    checkPassword = s => { if (!isPassword(s)) throw new ValidationError('password'); else return s; },
    isEmail = s => RE_MAIL.test(s),
    checkEmail = s => { if (!isEmail(s)) throw new ValidationError('mail'); else return s; },
    isContent = s => s && s.length < 65536,
    checkContent = s => { if (!isContent(s)) throw new ValidationError('content'); else return s; },
    isName = s => s && s.length < 256,
    checkName = s => { if (!isName(s)) throw new ValidationError('name'); else return s; },
    isPid = s => RE_PID.test(s.toString()),
    checkPid = s => { if (!RE_PID.test(s)) throw new ValidationError('pid'); else return s; };

module.exports = {
    isTitle, checkTitle,
    isUid, checkUid,
    isUname, checkUname,
    isPassword, checkPassword,
    isEmail, checkEmail,
    isContent, checkContent,
    isName, checkName,
    isPid, checkPid
};
/*
ID_RE = re.compile(r'[^\\/\s\u3000]([^\\/\n\r]*[^\\/\s\u3000])?')
ROLE_RE = re.compile(r'[_0-9A-Za-z]{1,256}')


def is_id(s):
  return bool(ID_RE.fullmatch(s))


def check_category_name(s):
  if not is_id(s):
    raise error.ValidationError('category_name')


def check_node_name(s):
  if not is_id(s):
    raise error.ValidationError('node_name')


def is_role(s):
  return bool(ROLE_RE.fullmatch(s))


def check_role(s):
  if not is_role(s):
    raise error.ValidationError('role')

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


def is_bulletin(s):
  return isinstance(s, str) and len(s) < 65536


def check_bulletin(s):
  if not is_bulletin(s):
    raise error.ValidationError('bulletin')


def is_lang(i):
  return i in constant.language.LANG_TEXTS


def check_lang(i):
  if not is_lang(i):
    raise error.ValidationError('lang')


def is_domain_invitation_code(s):
  return bool(DOMAIN_INVITATION_CODE_RE.fullmatch(s))


def check_domain_invitation_code(s):
  if not is_domain_invitation_code(s):
    raise error.ValidationError('invitation_code')

*/