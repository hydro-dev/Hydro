import attachObjectMeta from './util/objectMeta';

export const PRIVACY_PUBLIC = 0;
export const PRIVACY_REGISTERED_ONLY = 1;
export const PRIVACY_SECRET = 2;
export const PRIVACY_RANGE = {
  [PRIVACY_PUBLIC]: 'Public',
  [PRIVACY_REGISTERED_ONLY]: 'Visible to registered users',
  [PRIVACY_SECRET]: 'Secret',
};
attachObjectMeta(PRIVACY_RANGE, 'intKey', true);

export const FUNCTION_RANGE = {
  0: 'Disabled',
  1: 'Enabled',
};
attachObjectMeta(FUNCTION_RANGE, 'intKey', true);

export const BACKGROUND_RANGE = {
  1: 'Bg1',
  2: 'Bg2',
  3: 'Bg3',
  4: 'Bg4',
  5: 'Bg5',
  6: 'Bg6',
  7: 'Bg7',
  8: 'Bg8',
  9: 'Bg9',
  10: 'Bg10',
  11: 'Bg11',
  12: 'Bg12',
  13: 'Bg13',
  14: 'Bg14',
  15: 'Bg15',
  16: 'Bg16',
  17: 'Bg17',
  18: 'Bg18',
  19: 'Bg19',
  20: 'Bg20',
  21: 'Bg21',
};
attachObjectMeta(BACKGROUND_RANGE, 'intKey', true);
