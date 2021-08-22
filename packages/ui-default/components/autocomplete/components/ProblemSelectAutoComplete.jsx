import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import request from 'vj/utils/request';
import AutoComplete from './AutoComplete';

const ProblemSelectAutoComplete = forwardRef(function ProblemSelectAutoComplete(props, ref) {
    const itemsFn = (query) => {
        return request.get(`/d/${UiContext.domainId}/problem/list`, { prefix: query });
    };

    /* const itemText = (pdoc) => {
        return (pdoc.pid ? `${pdoc.pid} ` : '') + pdoc.title;
    }; */

    const itemKey = (pdoc) => {
        return pdoc.docId || pdoc;
    };

    const renderItem = (pdoc) => {
        return (
            <div className="media">
                <div className="media__body medium">
                    <div className="problem-select__name">{pdoc.pid ? `${pdoc.pid} ` : ''}{pdoc.title}</div>
                    <div className="problem-select__id">ID = {pdoc.docId}</div>
                </div>
            </div>
        );
    };

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
    name: PropTypes.string,
    listStyle: PropTypes.object,
    multi: PropTypes.bool,
    defaultItems: PropTypes.arrayOf(PropTypes.object),
    allowEmptyQuery: PropTypes.bool,
};

ProblemSelectAutoComplete.defaultProps = {
    width: '100%',
    height: 'auto',
    name: '',
    listStyle: {},
    multi: false,
    defaultItems: [],
    allowEmptyQuery: false,
};

ProblemSelectAutoComplete.displayName = 'ProblemSelectAutoComplete';

export default ProblemSelectAutoComplete;
