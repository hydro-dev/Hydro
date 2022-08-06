import classNames from 'classnames';
import PropTypes from 'prop-types';

export default function MessageComponent(props) {
  const {
    faceUrl,
    isSelf,
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, 'messagepad__message', {
    'side--self': isSelf,
    'side--other': !isSelf,
  });
  return (
    <li {...rest} className={cn}>
      <div className="messagepad__message__avatar">
        <img src={faceUrl} alt="avatar" width="50" height="50" className="medium user-profile-avatar" />
      </div>
      <div className="messagepad__message__body">
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
