import { Allotment } from 'allotment';
import { AnsiUp } from 'ansi_up';
import React from 'react';
import { connect } from 'react-redux';
import Icon from 'vj/components/react/IconComponent';
import { i18n } from 'vj/utils';
import DataInput from './DataInputComponent';
import Panel from './PanelComponent';

const AU = new AnsiUp();

const mapStateToProps = (state) => ({
  input: state.pretest.input,
  output: state.pretest.output,
  rid: state.pretest.rid,
});

const mapDispatchToProps = (dispatch) => ({
  handleDataChange(type, value) {
    dispatch({
      type: 'SCRATCHPAD_PRETEST_DATA_CHANGE',
      payload: {
        type,
        value,
      },
    });
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(class ScratchpadPretestContainer extends React.PureComponent {
  render() {
    return (
      <Panel
        title={(
          <span>
            <Icon name="edit" />
            {' '}
            {i18n('Pretest')}
          </span>
        )}
      >
        <Allotment>
          <DataInput
            title={i18n('Input')}
            value={this.props.input}
            onChange={(v) => this.props.handleDataChange('input', v)}
          />
          <DataInput
            title={i18n('Output')}
            value={AU.ansi_to_html(this.props.output)}
            html
          />
        </Allotment>
      </Panel>
    );
  }
});
