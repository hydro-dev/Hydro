import React, {
  forwardRef, createRef, useImperativeHandle, useRef, useEffect,
} from 'react';
import { useQuery } from 'react-query';
import PropTypes from 'prop-types';
import api, { gql } from 'vj/utils/api';
import AutoComplete from './AutoComplete';

// eslint-disable-next-line prefer-arrow-callback
const UserSelectAutoComplete = forwardRef(function UserSelectAutoComplete(props, ref) {
  const multi = props.multi ?? false;
  const rawDefaultItems = props.defaultItems ?? '';
  const defaultItems = multi ? rawDefaultItems
    .split(',')
    .map((i) => i.trim())
    .filter((i) => i.length > 0)
    .map((i) => +i) : rawDefaultItems;

  const comRef = createRef();
  const itemsBox = useRef([]);
  const { isLoading } = useQuery(['default_user', defaultItems], async () => {
    if (!multi || defaultItems.length === 0) return;
    const items = await api(gql`
      users(ids: ${defaultItems}) {
        _id
        uname
      }
    `, ['data', 'users']);
    itemsBox.current = items;
  });

  useEffect(() => {
    if (multi && defaultItems.length > 0) {
      comRef.current.setSelectedItems(itemsBox.current);
    }
  }, [itemsBox.current]);

  useImperativeHandle(ref, () => ({
    ...comRef.current,
  }));

  const itemsFn = (query) => api(gql`
    users(search: ${query}) {
      _id
      uname
      avatarUrl
    }
  `, ['data', 'users']);

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
      ref={comRef}
      {...props}
      disabled={isLoading}
      disabledHint="Loading..."
      itemsFn={itemsFn}
      itemText={itemText}
      renderItem={renderItem}
      defaultItems={multi ? [] : rawDefaultItems}
    />
  );
});

UserSelectAutoComplete.propTypes = {
  width: PropTypes.string,
  height: PropTypes.string,
  listStyle: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  multi: PropTypes.bool,
  defaultItems: PropTypes.string,
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
