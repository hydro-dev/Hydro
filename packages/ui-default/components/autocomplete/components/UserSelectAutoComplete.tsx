import { AutoComplete, AutoCompleteHandle, AutoCompleteProps } from '@hydrooj/components';
import type { Udoc } from 'hydrooj/src/interface';
import PropTypes from 'prop-types';
import { forwardRef } from 'react';
import { api, gql } from 'vj/utils';

const UserSelectAutoComplete = forwardRef<AutoCompleteHandle<Udoc>, AutoCompleteProps<Udoc>>((props, ref) => (
  <AutoComplete<Udoc>
    ref={ref as any}
    cacheKey="user"
    {...props}
    queryItems={(query) => api(gql`
      users(search: ${query}) {
        _id
        uname
        displayName
        avatarUrl
      }
    `, ['data', 'users'])}
    fetchItems={(ids) => api(gql`
      users(auto: ${ids}) {
        _id
        uname
        displayName
      }
    `, ['data', 'users'])}
    itemText={(user) => user.uname + (user.displayName ? ` (${user.displayName})` : '')}
    itemKey={(user) => ((props.multi || /^[+-]?\d+$/.test(user.uname.trim())) ? user._id.toString() : user.uname)}
    renderItem={(user) => (
      <div className="media">
        <div className="media__left medium">
          <img className="small user-profile-avatar" alt="" src={user.avatarUrl} width="30" height="30" />
        </div>
        <div className="media__body medium">
          <div className="user-select__uname">{user.uname}{user.displayName && ` (${user.displayName})`}</div>
          <div className="user-select__uid">UID = {user._id}</div>
        </div>
      </div>
    )}
  />
));

UserSelectAutoComplete.propTypes = {
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

UserSelectAutoComplete.defaultProps = {
  width: '100%',
  height: 'auto',
  listStyle: {},
  multi: false,
  selectedKeys: [],
  allowEmptyQuery: false,
  freeSolo: false,
  freeSoloConverter: (input) => input,
};

UserSelectAutoComplete.displayName = 'UserSelectAutoComplete';

export default UserSelectAutoComplete;
