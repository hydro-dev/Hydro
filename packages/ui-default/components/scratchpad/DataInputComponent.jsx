import PropTypes from 'prop-types';
import classNames from 'classnames';

export default function DataInputComponent(props) {
  const {
    html,
    title,
    value,
    onChange,
    className,
    ...rest
  } = props;
  const cn = classNames(className, 'flex-col flex-fill');
  return (
    <div {...rest} className={cn}>
      {html ? (
        <div
          className="scratchpad__data-input"
          style={{ overflowY: 'scroll' }}
          wrap="off"
        >
          {/* eslint-disable-next-line react/no-danger */}
          <pre dangerouslySetInnerHTML={{ __html: value }} contentEditable />
        </div>
      ) : (
        <textarea
          className="scratchpad__data-input"
          wrap="off"
          value={value}
          onChange={(ev) => {
            ev.stopPropagation();
            onChange(ev.target.value);
          }}
          placeholder={title}
        />
      )}
    </div>
  );
}

DataInputComponent.propTypes = {
  title: PropTypes.node,
  value: PropTypes.string,
  onChange: PropTypes.func,
  className: PropTypes.string,
};
