import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import request from 'vj/utils/request';
import AutoComplete from './AutoComplete';

// eslint-disable-next-line prefer-arrow-callback
const ProblemSelectAutoComplete = forwardRef(function ProblemSelectAutoComplete(props, ref) {
  const itemsFn = (query) => request.get(`/d/${UiContext.domainId}/problem/list`, { prefix: query });

  /* const itemText = (pdoc) => {
      return (pdoc.pid ? `${pdoc.pid} ` : '') + pdoc.title;
  }; */

  const itemKey = (pdoc) => `${pdoc.docId || pdoc}`; // force string

  const renderItem = (pdoc) => (
    <div className="media">
      <div className="media__body medium">
        <div className="problem-select__name">{pdoc.pid ? `${pdoc.pid} ` : ''}{pdoc.title}</div>
        <div className="problem-select__id">ID = {pdoc.docId}</div>
      </div>
    </div>
  );

  return (
    <AutoComplete
      ref={ref}
      itemsFn={itemsFn}
      itemText={itemKey}
      itemKey={itemKey}
      renderItem={renderItem}
      {...props}
    />
  );
});

ProblemSelectAutoComplete.propTypes = {
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

ProblemSelectAutoComplete.defaultProps = {
  width: '100%',
  height: 'auto',
  listStyle: {},
  multi: false,
  defaultItems: [],
  allowEmptyQuery: false,
  freeSolo: false,
  freeSoloConverter: (input) => input,
};

ProblemSelectAutoComplete.displayName = 'ProblemSelectAutoComplete';

export default ProblemSelectAutoComplete;
