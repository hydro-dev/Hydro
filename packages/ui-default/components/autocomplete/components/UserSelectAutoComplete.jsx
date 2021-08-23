import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import request from 'vj/utils/request';
import AutoComplete from './AutoComplete';

// eslint-disable-next-line prefer-arrow-callback
const UserSelectAutoComplete = forwardRef(function UserSelectAutoComplete(props, ref) {
  const itemsFn = (query) => request.get('/user/search', { q: query });

  const itemText = (user) => user.uname || user;

  const renderItem = (user) => (
    <div className="media">
      <div className="media__left medium">
        <img className="small user-profile-avatar" alt="" src={user.avatarUrl} width="30" height="30" />
      </div>
      <div className="media__body medium">
        <div className="user-select__uname">{user.uname}</div>
        <div className="user-select__uid">UID = {user._id}</div>
      </div>
    </div>
  );

  return (
    <AutoComplete
      ref={ref}
      itemsFn={itemsFn}
      itemText={itemText}
      renderItem={renderItem}
      {...props}
    />
  );
});

UserSelectAutoComplete.propTypes = {
  width: PropTypes.string,
  height: PropTypes.string,
  listStyle: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  multi: PropTypes.bool,
  defaultItems: PropTypes.oneOfType([(PropTypes.arrayOf(PropTypes.any)), PropTypes.string]),
  allowEmptyQuery: PropTypes.bool,
  freeSolo: PropTypes.bool,
  freeSoloConverter: PropTypes.func,
};

UserSelectAutoComplete.defaultProps = {
  width: '100%',
  height: 'auto',
  listStyle: {},
  multi: false,
  defaultItems: [],
  allowEmptyQuery: false,
  freeSolo: false,
  freeSoloConverter: (input) => input,
};

UserSelectAutoComplete.displayName = 'UserSelectAutoComplete';

export default UserSelectAutoComplete;
