import React from 'react';

export default class MessagePadContainer extends React.PureComponent {
  Textbox(args, name) {
    return (
      <label htmlFor={`textbox${name}`}>
        {args.desc}
        <div name={`form_item_${name}`} className="textbox-container">
          <input type="text" name={name} id={`textbox${name}`} className="textbox"></input>
        </div>
      </label>
    );
  }

  Radio(args, name) {
    return (
      <>
        {args.desc}
        {args.choices.map((i) => (
          <label className="radiobox" htmlFor={`radio${name}`}>
            <input type="radio" name={name} id={`radio${name}`} value={i} /> {i} <br />
          </label>
        ))}
      </>
    );
  }

  render() {
    return (
      <form>
        {this.props.panel.map((i, name) => (
          <div className="row">
            <div className="medium-7 columns form__item end">
              {i.choices ? this.Radio(i, name) : this.Textbox(i, name)}
            </div>
          </div>
        ))}
        <input type="submit" className="button rounded primary" value="提交" />
      </form>
    );
  }
}
