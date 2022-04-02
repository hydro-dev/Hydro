import PropTypes from 'prop-types';
import classNames from 'classnames';

export default function MessageComponent(props) {
  const {
    faceUrl,
    isSelf,
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, {
    'cright cmsg': isSelf,
    'cleft cmsg': !isSelf,
  });
  return (
    <div {...rest} className={cn}>
      <img src={faceUrl} alt="avatar" className="headIcon radius" onDragStart="return false;" onContextMenu="return false;" />
      <div className="content">
        {children}
      </div>
    </div>
  );
}

MessageComponent.propTypes = {
  isSelf: PropTypes.bool,
  faceUrl: PropTypes.string.isRequired,
  className: PropTypes.string,
  children: PropTypes.node,
};
