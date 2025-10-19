import classNames from 'classnames';
import _ from 'lodash';
import moment from 'moment';
import React from 'react';
import { connect } from 'react-redux';
import TimeAgo from 'timeago-react';
import { STATUS_CODES, STATUS_SCRATCHPAD_SHORT_TEXTS, STATUS_SCRATCHPAD_SHOW_DETAIL_FLAGS, STATUS_TEXTS } from 'vj/constant/record';
import {
  emulateAnchorClick, i18n, mongoId, substitute,
} from 'vj/utils';

const shouldShowDetail = (data) => STATUS_SCRATCHPAD_SHOW_DETAIL_FLAGS[data.status] && data.testCases?.length;

const getRecordDetail = (data) => {
  if (!shouldShowDetail(data)) {
    return (
      <span className={`record-status--text ${STATUS_CODES[data.status]}`}>
        {STATUS_TEXTS[data.status]}
      </span>
    );
  }
  const stat = _.pick(
    _.groupBy(data.testCases || [], 'status'),
    _.keys(STATUS_SCRATCHPAD_SHORT_TEXTS),
  );
  return _.map(STATUS_SCRATCHPAD_SHORT_TEXTS, (text, status) => {
    const count = (stat[status] && stat[status].length) || 0;
    const cn = classNames('icol icol--stat', {
      'record-status--text': count > 0,
      [STATUS_CODES[data.status]]: count > 0,
    });
    return (
      <span key={text} className={cn}>
        {text}: {count}
      </span>
    );
  });
};

const mapStateToProps = (state) => ({
  items: state.records.items,
});

const mergeProps = (stateProps, dispatchProps, ownProps) => ({
  ...dispatchProps,
  data: stateProps.items[ownProps.id],
});

// eslint-disable-next-line react-refresh/only-export-components
export default connect(mapStateToProps, null, mergeProps)(class ScratchpadRecordsRowContainer extends React.PureComponent {
  handleRowClick(ev, id) {
    const url = substitute(
      decodeURIComponent(UiContext.getRecordDetailUrl),
      { rid: id },
    );
    emulateAnchorClick(ev, url, true);
  }

  render() {
    const { data } = this.props;
    const submitAt = mongoId(data._id).timestamp * 1000;
    // Is pretest
    return data.contest?.toString() === '000000000000000000000000' ? null : (
      <tr onClick={(ev) => this.handleRowClick(ev, data._id)}>
        <td className={`col--detail record-status--border ${STATUS_CODES[data.status]}`}>
          <span className={`icon record-status--icon ${STATUS_CODES[data.status]}`}></span>
          <span className="icol icol--pretest"></span>
          {getRecordDetail(data)}
        </td>
        <td className="col--memory">
          {shouldShowDetail(data) ? `${Math.ceil(data.memory / 1000)} MB` : '-'}
        </td>
        <td className="col--time">
          {shouldShowDetail(data) ? `${(data.time / 1000).toFixed(1)}s` : '-'}
        </td>
        <td className="col--at">
          <time data-tooltip={moment(submitAt).format('YYYY-MM-DD HH:mm:ss')}>
            <TimeAgo datetime={submitAt} locale={i18n('timeago_locale')} />
          </time>
        </td>
      </tr>
    );
  }
});
