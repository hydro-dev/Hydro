import React from 'react';
import PropTypes from 'prop-types';

export default class DomComponent extends React.PureComponent {
  componentDidMount() {
    this.refs.dom.appendChild(this.props.childDom);
  }

  componentWillUnmount() {
    $(this.refs.dom).empty();
  }

  render() {
    const {
      childDom,
      ...rest
    } = this.props;
    return (
      <div {...rest} ref="dom"></div>
    );
  }
}

DomComponent.propTypes = {
  childDom: PropTypes.instanceOf(HTMLElement).isRequired,
};
