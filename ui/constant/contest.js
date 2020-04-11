import attachObjectMeta from './util/objectMeta';

export const RULE_OI = 'oi';
export const RULE_ACM = 'acm';
export const RULE_HOMEWORK = 'homework';

export const RULES = [
  RULE_OI,
  RULE_ACM,
  RULE_HOMEWORK,
];

export const RULE_TEXTS = {
  [RULE_OI]: 'OI',
  [RULE_ACM]: 'ACM/ICPC',
  [RULE_HOMEWORK]: 'Assignment',
};
attachObjectMeta(RULE_TEXTS, 'intKey', true);
