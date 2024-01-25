export const JOIN_METHOD_NONE = 0;
export const JOIN_METHOD_ALL = 1;
export const JOIN_METHOD_CODE = 2;
export const JOIN_METHOD_RANGE = {
  [JOIN_METHOD_NONE]: 'No user is allowed to join this domain',
  [JOIN_METHOD_ALL]: 'Any user is allowed to join this domain',
  [JOIN_METHOD_CODE]: 'Any user is allowed to join this domain with an invitation code',
};

export const JOIN_EXPIRATION_KEEP_CURRENT = 0;
export const JOIN_EXPIRATION_UNLIMITED = -1;

export const JOIN_EXPIRATION_RANGE = {
  [JOIN_EXPIRATION_KEEP_CURRENT]: 'Keep current expiration',
  3: 'In 3 hours',
  24: 'In 1 day',
  [24 * 3]: 'In 3 days',
  [24 * 7]: 'In 1 week',
  [24 * 30]: 'In 1 month',
  [JOIN_EXPIRATION_UNLIMITED]: 'Never expire',
};
