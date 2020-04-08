import attachObjectMeta from './util/objectMeta';

export const CONTEST_TYPE_CONTEST = 1;
export const CONTEST_TYPE_HOMEWORK = 2;

export const RULE_OI = 2;
export const RULE_ACM = 3;
export const RULE_ASSIGNMENT = 11;

export const DOCTYPE_TO_CTYPE = {
  30: 'contest',
  60: 'homework',
};
attachObjectMeta(DOCTYPE_TO_CTYPE, 'intKey', true);

export const CTYPE_TO_DOCTYPE = {
  contest: 30,
  homework: 60,
};

export const CONTEST_RULES = [
  RULE_OI,
  RULE_ACM,
];

export const HOMEWORK_RULES = [
  RULE_ASSIGNMENT,
];

export const RULE_ID = {
  [RULE_OI]: 'oi',
  [RULE_ACM]: 'acm',
  [RULE_ASSIGNMENT]: 'assignment',
};
attachObjectMeta(RULE_ID, 'intKey', true);

export const RULE_TEXTS = {
  [RULE_OI]: 'OI',
  [RULE_ACM]: 'ACM/ICPC',
  [RULE_ASSIGNMENT]: 'Assignment',
};
attachObjectMeta(RULE_TEXTS, 'intKey', true);
