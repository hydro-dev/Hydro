import { AutoComplete, AutoCompleteHandle, AutoCompleteProps } from '@hydrooj/components';
import type { GDoc, Udoc } from 'hydrooj/src/interface';
import PropTypes from 'prop-types';
import React, { forwardRef } from 'react';
import { api } from 'vj/utils';

interface AssignItem {
  type: 'user' | 'group';
  key: string;
  name: string;
  displayName?: string;
  avatarUrl?: string;
  uids?: number[];
  invalid?: boolean;
}

const toUserItem = (user: Udoc): AssignItem => ({
  type: 'user',
  key: user._id.toString(),
  name: user.uname,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
});

const toGroupItem = (group: GDoc): AssignItem => ({
  type: 'group',
  key: group.name,
  name: group.name,
  uids: group.uids,
});

const AssignSelectAutoComplete = forwardRef<AutoCompleteHandle<AssignItem>, AutoCompleteProps<AssignItem>>((props, ref) => (
  <AutoComplete<AssignItem>
    ref={ref as any}
    cacheKey="assign"
    queryItems={async (query) => {
      const [users, groups] = await Promise.all([
        api('users', { search: query }, ['_id', 'uname', 'displayName', 'avatarUrl']),
        api('groups', { search: query }, ['name', 'uids']),
      ]);
      const userItems: AssignItem[] = users.map((user: Udoc) => toUserItem(user));
      const groupItems: AssignItem[] = groups.map((group: GDoc) => toGroupItem(group));
      return [...groupItems, ...userItems];
    }}
    fetchItems={async (keys) => {
      const isUserId = (k: string) => /^-?[0-9]+$/.test(k);
      const userIds = keys.filter((k) => isUserId(k));
      const groupNames = keys.filter((k) => !isUserId(k));

      const [users, groups]: [Udoc[], GDoc[]] = await Promise.all([
        userIds.length > 0 ? api('users', { auto: userIds }, ['_id', 'uname', 'displayName']) : [],
        groupNames.length > 0 ? api('groups', { names: groupNames }, ['name', 'uids']) : [],
      ]);

      const userItems: AssignItem[] = users.map((user: Udoc) => toUserItem(user));
      const groupItems: AssignItem[] = keys
        .filter((key) => !isUserId(key))
        .map((key) => {
          const group = groups.find((g) => g.name === key);
          return group ? toGroupItem(group) : { type: 'group', key, name: key, invalid: true };
        });

      return [...groupItems, ...userItems];
    }}
    itemText={(item) => {
      if (item.type === 'group') {
        if (item.invalid) return `${item.name} (invalid)`;
        return `${item.name} (${item.uids?.length || 0} users)`;
      }
      return item.name + (item.displayName ? ` (${item.displayName})` : '');
    }}
    itemKey={(item) => item.key}
    renderItem={(item) => (
      <div className="media">
        {item.type === 'user' && (
          <div className="media__left medium">
            <img className="small user-profile-avatar" alt="" src={item.avatarUrl} width="30" height="30" />
          </div>
        )}
        <div className="media__body medium">
          <div className="assign-select__name">
            {item.name}{item.type === 'user' && item.displayName && ` (${item.displayName})`}
          </div>
          <div className="assign-select__desc">
            {item.type === 'group' ? `Group • ${item.uids?.length || 0} users` : `User • UID = ${item.key}`}
          </div>
        </div>
      </div>
    )}
    {...{
      width: '100%',
      height: 'auto',
      listStyle: {},
      multi: true,
      selectedKeys: [],
      allowEmptyQuery: false,
      freeSolo: false,
      freeSoloConverter: (input) => input,
      ...props,
    }}
  />
));

AssignSelectAutoComplete.propTypes = {
  width: PropTypes.string,
  height: PropTypes.string,
  listStyle: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  multi: PropTypes.bool,
  selectedKeys: PropTypes.arrayOf(PropTypes.string),
  allowEmptyQuery: PropTypes.bool,
  freeSolo: PropTypes.bool,
  freeSoloConverter: PropTypes.func,
};

AssignSelectAutoComplete.displayName = 'AssignSelectAutoComplete';

export default AssignSelectAutoComplete;
