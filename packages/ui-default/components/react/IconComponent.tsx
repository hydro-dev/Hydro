import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

export default function IconComponent(props: { name: string, className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const {
    name,
    className,
    ...rest
  } = props;
  const cn = classNames(className, `icon icon-${name}`);
  return (
    <span {...rest} className={cn} />
  );
}

IconComponent.propTypes = {
  name: PropTypes.string.isRequired,
  className: PropTypes.string,
};
