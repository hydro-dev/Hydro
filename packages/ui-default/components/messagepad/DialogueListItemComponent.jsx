import classNames from 'classnames';
import PropTypes from 'prop-types';

export default function DialogueListItemComponent(props) {
  const {
    userName,
    summary,
    faceUrl,
    active,
    onClick,
    className,
    ...rest
  } = props;
  const cn = classNames(className, 'messagepad__list-item media', {
    active,
  });
  return (
    <li {...rest}>
      <a className={cn} onClick={onClick}>
        <div className="media__left middle">
          <img src={faceUrl} alt="avatar" width="50" height="50" className="medium user-profile-avatar" />
        </div>
        <div className="media__body middle">
          <h3 className="messagepad__username">{userName}</h3>
          <div className="messagepad__desc">{summary}</div>
        </div>
      </a>
    </li>
  );
}

DialogueListItemComponent.propTypes = {
  userName: PropTypes.string.isRequired,
  summary: PropTypes.string.isRequired,
  faceUrl: PropTypes.string.isRequired,
  active: PropTypes.bool,
  onClick: PropTypes.func,
  className: PropTypes.string,
};
