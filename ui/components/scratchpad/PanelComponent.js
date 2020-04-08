import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import SplitPaneFillOverlay from 'vj/components/react-splitpane/SplitPaneFillOverlayComponent';

export default function PanelComponent(props) {
  const {
    title,
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, 'flex-col');
  return (
    <SplitPaneFillOverlay {...rest} className={cn}>
      <div className="scratchpad__panel-title">{title}</div>
      <div className="flex-col flex-fill">{children}</div>
    </SplitPaneFillOverlay>
  );
}

PanelComponent.propTypes = {
  title: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node,
};
