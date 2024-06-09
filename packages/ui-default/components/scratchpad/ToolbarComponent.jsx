import classNames from 'classnames';
import PropTypes from 'prop-types';

export default function ToolbarComponent(props) {
  const {
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, 'scratchpad__toolbar flex-row flex-cross-center');
  return (
    <div {...rest} className={cn}>{children}</div>
  );
}

ToolbarComponent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

export function ToolbarButtonComponent(props) {
  const {
    activated = false,
    disabled = false,
    onClick,
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, 'scratchpad__toolbar__item scratchpad__toolbar__button', {
    activated,
    disabled,
    enabled: !disabled,
  });
  return (
    <button
      {...rest}
      tabIndex="-1"
      className={cn}
      onClick={() => !disabled && onClick && onClick()}
    >
      <div>{children}</div>
    </button>
  );
}

ToolbarButtonComponent.propTypes = {
  activated: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  className: PropTypes.string,
  children: PropTypes.node,
};

export function ToolbarSplitComponent(props) {
  const {
    className,
    ...rest
  } = props;
  const cn = classNames(className, 'scratchpad__toolbar__item scratchpad__toolbar__split');
  return (
    <div {...rest} className={cn} />
  );
}

ToolbarSplitComponent.propTypes = {
  className: PropTypes.string,
};

export function ToolbarItemComponent(props) {
  const {
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, 'scratchpad__toolbar__item');
  return (
    <div {...rest} className={cn}>{children}</div>
  );
}

ToolbarItemComponent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};
