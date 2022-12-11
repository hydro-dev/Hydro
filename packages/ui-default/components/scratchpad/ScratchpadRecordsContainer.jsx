import classNames from 'classnames';
import React from 'react';
import { connect } from 'react-redux';
import Icon from 'vj/components/react/IconComponent';
import { i18n } from 'vj/utils';
import Panel from './PanelComponent';
import ScratchpadRecordsRow from './ScratchpadRecordsRowContainer';

const mapStateToProps = (state) => ({
  rows: state.records.rows,
  isLoading: state.ui.records.isLoading,
});

export default connect(mapStateToProps)(class ScratchpadRecordsContainer extends React.PureComponent {
  render() {
    const cn = classNames('data-table is--full-row scratchpad__records__table', {
      loading: this.props.isLoading,
    });
    return (
      <Panel
        title={(
          <span>
            <Icon name="flag" />
            {' '}
            {i18n('Records')}
          </span>
        )}
      >
        <table className={cn}>
          <colgroup>
            <col className="col--detail" />
            <col className="col--memory" />
            <col className="col--time" />
            <col className="col--at" />
          </colgroup>
          <tbody>
            {this.props.rows.map((rowId) => (
              <ScratchpadRecordsRow key={rowId} id={rowId} />
            ))}
          </tbody>
        </table>
      </Panel>
    );
  }
});
