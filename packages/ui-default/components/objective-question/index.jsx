import React from 'react';
import { sortBy } from 'lodash';
import request from 'vj/utils/request';

export default class ObjectiveContainer extends React.PureComponent {
  constructor(args) {
    super(args);
    this.state = {};
    this.onChange = this.onChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
  }

  onChange(ev) {
    this.setState({ [ev.target.name]: ev.target.value });
  }

  onSubmit(ev) {
    ev.preventDefault();
    const entries = sortBy(Object.entries(this.state).map((i) => [+i[0], i[1]]));
    const total = entries[entries.length - 1][0];
    const ans = new Array(total).fill('');
    entries.forEach((i) => ans[i[0]] = i[1]); // eslint-disable-line
    request
      .post(this.props.target, {
        lang: '_',
        code: ans.join('\n'),
      })
      .then((res) => {
        window.location.href = res.url;
      })
      .catch((e) => {
        Notification.error(e.message);
      });
  }

  Textbox(args, name) {
    return (
      <label htmlFor={`textbox${name}`}>
        {name + 1}. {args.desc.split('\n').map((i, index) => {
          if (index) return <><br />{i}</>;
          return i;
        })}
        <div name={`form_item_${name}`} className="textbox-container">
          <input type="text" name={name} id={`textbox${name}`} className="textbox" onChange={this.onChange}></input>
        </div>
      </label>
    );
  }

  Radio(args, name) {
    return (
      <>
        {name + 1}. {args.desc.split('\n').map((i, index) => {
          if (index) return <><br />{i}</>;
          return i;
        })}
        {args.choices.map((i) => (
          <label className="radiobox" htmlFor={`radio${name}${i}`} key={i}>
            <input type="radio" name={name} id={`radio${name}${i}`} value={i} onChange={this.onChange} /> {i} <br />
          </label>
        ))}
      </>
    );
  }

  render() {
    return (
      <form onSubmit={this.onSubmit}>
        {this.props.panel.map((i, name) => (
          <div className="row" key={i}>
            <div className="medium-7 columns form__item end">
              {i.choices ? this.Radio(i, name) : this.Textbox(i, name)}
            </div>
          </div>
        ))}
        {document.getElementsByClassName('nav__item--round').length
          ? <input type="submit" disabled className="button rounded primary" value="登录后提交" />
          : <input type="submit" className="button rounded primary" value="提交" />}
      </form>
    );
  }
}
