import React from 'react';
import { connect } from 'react-redux';

import i18n from 'vj/utils/i18n';
import DataInput from './DataInputComponent';

const mapStateToProps = state => ({
  data: state.pretest.data,
});

const mapDispatchToProps = dispatch => ({
  handleDataChange(id, type, value) {
    dispatch({
      type: 'SCRATCHPAD_PRETEST_DATA_CHANGE',
      payload: {
        id,
        type,
        value,
      },
    });
  },
});

const mergeProps = (stateProps, dispatchProps, ownProps) => ({
  ...dispatchProps,
  id: ownProps.id,
  input: stateProps.data[ownProps.id] ? stateProps.data[ownProps.id].input : '',
  output: stateProps.data[ownProps.id] ? stateProps.data[ownProps.id].output : '',
});

@connect(mapStateToProps, mapDispatchToProps, mergeProps)
export default class ScratchpadPretestTabPaneContainer extends React.PureComponent {
  render() {
    return (
      <div className="flex-row flex-fill">
        <DataInput
          title={i18n('Sample Input')}
          value={this.props.input}
          onChange={v => this.props.handleDataChange(this.props.id, 'input', v)}
        />
        <DataInput
          title={i18n('Sample Output')}
          value={this.props.output}
          onChange={v => this.props.handleDataChange(this.props.id, 'output', v)}
        />
      </div>
    );
  }
}
