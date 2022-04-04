import React from 'react';
import PropTypes from 'prop-types';
import AutoComplete from './AutoComplete';

const CustomSelectAutoComplete = React.forwardRef<any, any>((props, ref) => (
  <AutoComplete<any>
    ref={ref as any}
    queryItems={(query) => props.data.filter((i) => (i.name ? i.name.match(query) : i.match(query)))}
    itemText={(item) => `${item.name || item}`}
    itemKey={(item) => `${item._id?.toString() || item.name || item}`}
    renderItem={(item) => `${item.name || item}`}
    {...props}
  />
));

CustomSelectAutoComplete.propTypes = {
  width: PropTypes.string,
  height: PropTypes.string,
  listStyle: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  multi: PropTypes.bool,
  selectedKeys: PropTypes.arrayOf(PropTypes.string),
  allowEmptyQuery: PropTypes.bool,
  freeSolo: PropTypes.bool,
  freeSoloConverter: PropTypes.func,
  data: PropTypes.any,
};

CustomSelectAutoComplete.displayName = 'CustomSelectAutoComplete';

CustomSelectAutoComplete.defaultProps = {
  width: '100%',
  height: 'auto',
  listStyle: {},
  multi: false,
  selectedKeys: [],
  allowEmptyQuery: false,
  freeSolo: false,
  freeSoloConverter: (input) => input,
};

export default CustomSelectAutoComplete;
