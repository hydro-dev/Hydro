import React from 'react';
import { connect } from 'react-redux';
import Tabs, { TabPane } from 'rc-tabs';
import TabContent from 'rc-tabs/lib/TabContent';
import ScrollableInkTabBar from 'rc-tabs/lib/ScrollableInkTabBar';

import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import Icon from 'vj/components/react/IconComponent';
import Panel from './PanelComponent';
import PanelButton from './PanelButtonComponent';
import ScratchpadRecordsTable from './ScratchpadRecordsTableContainer';

const mapDispatchToProps = dispatch => ({
  loadSubmissions() {
    dispatch({
      type: 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS',
      payload: request.get(Context.getSubmissionsUrl),
    });
  },
  handleClickClose() {
    dispatch({
      type: 'SCRATCHPAD_UI_SET_VISIBILITY',
      payload: {
        uiElement: 'records',
        visibility: false,
      },
    });
  },
  handleClickRefresh() {
    this.loadSubmissions();
  },
});

@connect(null, mapDispatchToProps)
export default class ScratchpadRecordsContainer extends React.PureComponent {
  componentDidMount() {
    this.props.loadSubmissions();
  }

  render() {
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
        <Tabs
          className="scratchpad__panel-tab flex-col flex-fill"
          activeKey="all"
          animation="slide-horizontal"
          renderTabBar={() => (
            <ScrollableInkTabBar
              extraContent={(
                <span>
                  <PanelButton
                    data-tooltip={i18n('Refresh Records')}
                    data-tooltip-pos="top right"
                    onClick={() => this.props.handleClickRefresh()}
                  >
                    {i18n('Refresh')}
                  </PanelButton>
                  <PanelButton
                    onClick={() => this.props.handleClickClose()}
                  >
                    <Icon name="close" />
                  </PanelButton>
                </span>
              )}
            />
          )}
          renderTabContent={() => <TabContent />}
        >
          <TabPane tab={<span>{i18n('All')}</span>} key="all">
            <ScratchpadRecordsTable />
          </TabPane>
        </Tabs>
      </Panel>
    );
  }
}
