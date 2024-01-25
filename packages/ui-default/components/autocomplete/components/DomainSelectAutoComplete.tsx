import type { DomainDoc } from 'hydrooj/src/interface';
import PropTypes from 'prop-types';
import React, { forwardRef } from 'react';
import { request } from 'vj/utils';
import AutoComplete, { AutoCompleteHandle, AutoCompleteProps } from './AutoComplete';

const DomainSelectAutoComplete = forwardRef<AutoCompleteHandle<DomainDoc>, AutoCompleteProps<DomainDoc>>((props, ref) => (
  <AutoComplete<DomainDoc>
    ref={ref as any}
    cacheKey="domain"
    renderItem={(domain) => (
      <div className="media">
        <div className="media__left medium">
          <img className="small domain-profile-avatar" src={domain.avatarUrl} alt="" width="30" height="30" />
        </div>
        <div className="media__body medium">
          <div className="domain-select__name">{domain.name}</div>
          <div className="domain-select__id">ID = {domain._id}</div>
        </div>
      </div>
    )}
    queryItems={(query) => request.get('/domain/search', { q: query })}
    itemText={(domain) => domain.name}
    itemKey={(domain) => domain._id}
    {...props}
  />
));

DomainSelectAutoComplete.propTypes = {
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

DomainSelectAutoComplete.defaultProps = {
  width: '100%',
  height: 'auto',
  listStyle: {},
  multi: false,
  selectedKeys: [],
  allowEmptyQuery: true,
  freeSolo: false,
  freeSoloConverter: (input) => input,
};

DomainSelectAutoComplete.displayName = 'DomainSelectAutoComplete';

export default DomainSelectAutoComplete;
