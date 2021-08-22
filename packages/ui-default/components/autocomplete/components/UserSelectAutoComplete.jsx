import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import request from 'vj/utils/request';
import AutoComplete from './AutoComplete';

const UserSelectAutoComplete = forwardRef(function UserSelectAutoComplete(props, ref) {
    const itemsFn = (query) => {
        return request.get('/user/search', { q: query });
    };

    const itemText = (user) => {
        return user.uname || user;
    };

    const renderItem = (user) => {
        return (
            <div className="media">
                <div className="media__left medium">
                    <img className="small user-profile-avatar" src={user.avatarUrl} width="30" height="30" />
                </div>
                <div className="media__body medium">
                    <div className="user-select__uname">{user.uname}</div>
                    <div className="user-select__uid">UID = {user._id}</div>
                </div>
            </div>
        );
    };

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
    name: PropTypes.string,
    listStyle: PropTypes.object,
    multi: PropTypes.bool,
    defaultItems: PropTypes.arrayOf(PropTypes.object),
    allowEmptyQuery: PropTypes.bool,
};

UserSelectAutoComplete.defaultProps = {
    width: '100%',
    height: 'auto',
    name: '',
    listStyle: {},
    multi: false,
    defaultItems: [],
    allowEmptyQuery: false,
};

UserSelectAutoComplete.displayName = 'UserSelectAutoComplete';

export default UserSelectAutoComplete;
