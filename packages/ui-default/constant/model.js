import attachObjectMeta from './util/objectMeta';

export const USER_GENDER_MALE = 0;
export const USER_GENDER_FEMALE = 1;
export const USER_GENDER_OTHER = 2;
export const USER_GENDERS = [USER_GENDER_MALE, USER_GENDER_FEMALE, USER_GENDER_OTHER];
export const USER_GENDER_RANGE = {
  [USER_GENDER_MALE]: 'Boy ♂',
  [USER_GENDER_FEMALE]: 'Girl ♀',
  [USER_GENDER_OTHER]: 'Other',
};
attachObjectMeta(USER_GENDER_RANGE, 'intKey', true);
export const USER_GENDER_ICONS = {
  [USER_GENDER_MALE]: '♂',
  [USER_GENDER_FEMALE]: '♀',
  [USER_GENDER_OTHER]: '?',
};
attachObjectMeta(USER_GENDER_ICONS, 'intKey', true);
