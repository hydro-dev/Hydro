import { AutoComplete, AutoCompleteHandle, AutoCompleteProps } from '@hydrooj/components';
import type { ProblemDoc } from 'hydrooj/src/interface';
import PropTypes from 'prop-types';
import React, { forwardRef } from 'react';
import { api, request } from 'vj/utils';

const ProblemSelectAutoComplete = forwardRef<AutoCompleteHandle<ProblemDoc>, AutoCompleteProps<ProblemDoc>>((props, ref) => (
  <AutoComplete<ProblemDoc>
    ref={ref as any}
    cacheKey={`problem-${UiContext.domainId}`}
    queryItems={async (query) => {
      const { pdocs } = await request.get(`/d/${UiContext.domainId}/p`, { q: query, quick: true, sort: query ? 'default' : 'recent' });
      return pdocs;
    }}
    fetchItems={(ids) => api('problems', { ids: ids.map((i) => +i) }, ['docId', 'pid', 'title'])}
    itemText={(pdoc) => `${`${pdoc.docId} ${pdoc.title}`}`}
    itemKey={(pdoc) => `${pdoc.docId || pdoc}`}
    renderItem={(pdoc) => (
      <div className="media">
        <div className="media__body medium">
          <div className="problem-select__name">{pdoc.pid ? `${pdoc.pid} ` : ''}{pdoc.title}</div>
          <div className="problem-select__id">ID = {pdoc.docId}</div>
        </div>
      </div>
    )}
    {...{
      width: '100%',
      height: 'auto',
      listStyle: {},
      multi: false,
      selectedKeys: [],
      allowEmptyQuery: true,
      freeSolo: false,
      freeSoloConverter: (input) => input,
      ...props,
    }}
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

ProblemSelectAutoComplete.displayName = 'ProblemSelectAutoComplete';

export default ProblemSelectAutoComplete;
