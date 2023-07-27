import PropTypes from 'prop-types';

export default function DataInputComponent(props) {
  const {
    html,
    title,
    value,
    onChange,
    className,
    ...rest
  } = props;
  return (
    <div {...rest} className={className} style={{ height: '100%', width: '100%' }}>
      {html ? (
        <div
          className="scratchpad__data-input"
          style={{ overflowY: 'scroll' }}
          wrap="off"
          spellCheck="false"
        >
          {/* eslint-disable-next-line react/no-danger */}
          <pre dangerouslySetInnerHTML={{ __html: value }} contentEditable />
        </div>
      ) : (
        <textarea
          className="scratchpad__data-input"
          wrap="off"
          spellCheck="false"
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
