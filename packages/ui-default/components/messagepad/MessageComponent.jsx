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
    'cmsg cright': isSelf,
    'cmsg cleft': !isSelf,
  });
  return (
    <li {...rest} className={cn}>
      <div>
        <img src={faceUrl} alt="avatar" className="headIcon radius" onDragStart="return false;" onContextMenu="return false;" />
      </div>
      <div className="content">
        {children}
      </div>
    </li>
  );
}

MessageComponent.propTypes = {
  isSelf: PropTypes.bool,
  faceUrl: PropTypes.string.isRequired,
  className: PropTypes.string,
  children: PropTypes.node,
};
