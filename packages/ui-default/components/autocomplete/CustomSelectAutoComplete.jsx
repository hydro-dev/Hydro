import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import AutoComplete from './components/AutoComplete';

// eslint-disable-next-line prefer-arrow-callback
const CustomSelectAutoComplete = forwardRef(function CustomSelectAutoComplete(props, ref) {
  const itemsFn = (query) => props.data.filter((i) => (i.name ? i.name.match(query) : i.match(query)));

  /* const itemText = (pdoc) => {
      return (pdoc.pid ? `${pdoc.pid} ` : '') + pdoc.title;
  }; */

  const itemKey = (item) => `${item.id || item.name || item}`; // force string

  const renderItem = (item) => `${item.name || item}`;

  return (
    <AutoComplete
      ref={ref}
      itemsFn={itemsFn}
      itemText={renderItem}
      itemKey={itemKey}
      renderItem={renderItem}
      {...props}
    />
  );
});

CustomSelectAutoComplete.propTypes = {
  width: PropTypes.string,
  height: PropTypes.string,
  listStyle: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  multi: PropTypes.bool,
  defaultItems: PropTypes.oneOfType([(PropTypes.arrayOf(PropTypes.any)), PropTypes.string]),
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
  defaultItems: [],
  allowEmptyQuery: false,
  freeSolo: false,
  freeSoloConverter: (input) => input,
};

export default CustomSelectAutoComplete;
