import PropTypes from 'prop-types';
import classNames from 'classnames';

export default function IconComponent(props) {
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
