import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import request from 'vj/utils/request';
import type { ProblemDoc } from 'hydrooj/src/interface';
import AutoComplete, { AutoCompleteHandle, AutoCompleteProps } from './AutoComplete';

const ProblemSelectAutoComplete = forwardRef<AutoCompleteHandle<ProblemDoc>, AutoCompleteProps<ProblemDoc>>((props, ref) => (
  <AutoComplete<ProblemDoc>
    ref={ref as any}
    cacheKey={`problem-${UiContext.domainId}`}
    queryItems={(query) => request.get(`/d/${UiContext.domainId}/problem/list`, { prefix: query })}
    // FIXME fetch items
    fetchItems={() => []}
    itemText={(pdoc) => `${pdoc.docId || pdoc}`}
    itemKey={(pdoc) => `${pdoc.docId || pdoc}`}
    renderItem={(pdoc) => (
      <div className="media">
        <div className="media__body medium">
          <div className="problem-select__name">{pdoc.pid ? `${pdoc.pid} ` : ''}{pdoc.title}</div>
          <div className="problem-select__id">ID = {pdoc.docId}</div>
        </div>
      </div>
    )}
    {...props}
  />
));

ProblemSelectAutoComplete.propTypes = {
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

ProblemSelectAutoComplete.defaultProps = {
  width: '100%',
  height: 'auto',
  listStyle: {},
  multi: false,
  selectedKeys: [],
  allowEmptyQuery: false,
  freeSolo: false,
  freeSoloConverter: (input) => input,
};

ProblemSelectAutoComplete.displayName = 'ProblemSelectAutoComplete';

export default ProblemSelectAutoComplete;
