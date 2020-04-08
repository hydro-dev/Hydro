import React from 'react';
import classNames from 'classnames';
import { connect } from 'react-redux';
import ScratchpadRecordsRow from './ScratchpadRecordsRowContainer';

const mapStateToProps = state => ({
  rows: state.records.rows,
  isLoading: state.ui.records.isLoading,
});

@connect(mapStateToProps)
export default class ScratchpadRecordsTableContainer extends React.PureComponent {
  render() {
    const cn = classNames('data-table is--full-row scratchpad__records__table', {
      loading: this.props.isLoading,
    });
    return (
      <table className={cn}>
        <colgroup>
          <col className="col--detail" />
          <col className="col--memory" />
          <col className="col--time" />
          <col className="col--at" />
        </colgroup>
        <tbody>
          {this.props.rows.map(rowId => (
            <ScratchpadRecordsRow key={rowId} id={rowId} />
          ))}
        </tbody>
      </table>
    );
  }
}
