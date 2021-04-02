import PropTypes from 'prop-types';
import classNames from 'classnames';

export default function DataInputComponent(props) {
  const {
    title,
    value,
    onChange,
    className,
    ...rest
  } = props;
  const cn = classNames(className, 'flex-col flex-fill');
  return (
    <div {...rest} className={cn}>
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
    </div>
  );
}

DataInputComponent.propTypes = {
  title: PropTypes.node,
  value: PropTypes.string,
  onChange: PropTypes.func,
  className: PropTypes.string,
};
