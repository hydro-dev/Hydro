import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

export default function PanelComponent(props) {
  const {
    title,
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, 'flex-col');
  return (
    <div {...rest} className={`${cn} splitpane-fill`}>
      <div className="scratchpad__panel-title">{title}</div>
      <div className="flex-col flex-fill">{children}</div>
    </div>
  );
}

PanelComponent.propTypes = {
  title: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node,
};
