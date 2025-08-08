/* eslint-disable react-refresh/only-export-components */
import $ from 'jquery';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { i18n, tpl } from 'vj/utils';
import DomainSelectAutoComplete from '../autocomplete/components/DomainSelectAutoComplete';
import UserSelectAutoComplete from '../autocomplete/components/UserSelectAutoComplete';
import DomDialog, { DialogOptions } from './DomDialog';

export class Dialog {
  options: DialogOptions;
  $dom: JQuery<any>;
  domDialogInstance: DomDialog;

  constructor(options: Partial<DialogOptions> = {}) {
    this.options = {
      classes: '',
      $body: null,
      $action: null,
      ...options,
    };
    const box: React.CSSProperties = {};
    if (options.width) box.width = box.maxWidth = options.width;
    if (options.height) box.height = box.maxHeight = options.height;
    this.$dom = $(tpl(
      <div className={`dialog withBg ${this.options.classes}`} style={{ display: 'none' }}>
        <div className="dialog__content" style={box}>
          <div className="dialog__body" style={{ height: 'calc(100% - 45px)' }} />
          <div className="row"><div className="columns clearfix">
            <div className="float-right dialog__action" />
          </div></div>
        </div>
      </div>,
    ));
    this.$dom.on('click', '[data-action]', this.handleActionButton.bind(this));
    this.$dom.on('vjDomDialogShow', this.beforeShow.bind(this));
    this.$dom.on('vjDomDialogHidden', this.afterHide.bind(this));
    this.$dom.find('.dialog__body').append(this.options.$body);
    this.$dom.find('.dialog__action').append(this.options.$action);
    this.domDialogInstance = new DomDialog(this.$dom, this.options);
  }

  beforeShow() {
    this.$dom.appendTo('body');
  }

  afterHide() {
    this.$dom.detach();
  }

  open() {
    return this.domDialogInstance.show();
  }

  close() {
    return this.domDialogInstance.hide();
  }

  handleActionButton(ev) {
    this.domDialogInstance.dispatchAction($(ev.currentTarget).attr('data-action'));
  }
}

export default Dialog;

const buttonOk = tpl`<button class="primary rounded button" data-action="ok">${i18n('Ok')}</button>`;
const buttonCancel = tpl`<button class="rounded button" data-action="cancel">${i18n('Cancel')}</button>`;
const buttonYes = tpl`<button class="primary rounded button" data-action="yes">${i18n('Yes')}</button>`;
const buttonNo = tpl`<button class="rounded button" data-action="no">${i18n('No')}</button>`;

export class InfoDialog extends Dialog {
  constructor(options: Partial<DialogOptions> = {}) {
    super({
      $action: buttonOk,
      cancelByClickingBack: true,
      cancelByEsc: true,
      ...options,
    });
  }
}

export class ActionDialog extends Dialog {
  constructor(options: Partial<DialogOptions> = {}) {
    super({
      $action: [buttonCancel, buttonOk].join('\n'),
      cancelByClickingBack: true,
      cancelByEsc: true,
      ...options,
    });
  }

  clear() {
    this.$dom.find('input').val('');
    return this;
  }
}

export class ConfirmDialog extends Dialog {
  constructor(options: Partial<DialogOptions> = {}) {
    let buttons = [];
    if (options.canCancel) {
      buttons = [buttonCancel, buttonNo, buttonYes];
    } else {
      buttons = [buttonNo, buttonYes];
    }
    super({
      $action: buttons.join('\n'),
      cancelByClickingBack: options.canCancel,
      cancelByEsc: options.canCancel,
      ...options,
    });
  }
}

export interface Field {
  type: 'text' | 'checkbox' | 'user' | 'userId' | 'username' | 'domain';
  placeholder?: string;
  label?: string;
  autofocus?: boolean;
  required?: boolean;
  default?: string;
}

type Result<T extends string, R extends Record<T, Field>> = {
  [K in keyof R]: ('text' | 'password' | 'username' | 'domain') extends R[K]['type'] ? string
    : R[K]['type'] extends 'checkbox' ? boolean
      : R[K]['type'] extends 'userId' ? number
        : R[K]['type'] extends 'user' ? any
          : never;
};

export async function prompt<T extends string, R extends Record<T, Field>>(title: string, fields: R): Promise<Result<T, R>> {
  let valueCache: Result<T, R> = {} as any;
  const defaultValues = Object.fromEntries(Object.entries(fields)
    .map(([name, field]: [T, Field]) => [name, field.default || ''])) as Result<T, R>;

  const Component = () => {
    const [values, setValues] = React.useState(defaultValues);
    const [selected, setSelected] = React.useState<Partial<Result<T, R>>>({});
    const refs = React.useRef<Partial<Record<T, React.RefObject<any>>>>({});

    React.useEffect(() => {
      valueCache = values;
    }, [values]);

    return <div>
      <div className="row"><div className="columns">
        <h1>{title}</h1>
      </div></div>
      {Object.entries(fields).map(([name, field]: [string, Field]) => <div className="row" key={name}>
        <div className="columns">
          {['text', 'user', 'userId', 'username', 'domain'].includes(field.type) && <label>
            {field.label}
            <div className="textbox-container">
              {['text', 'password'].includes(field.type)
                ? <input
                  type={field.type}
                  className="textbox"
                  data-autofocus={field.autofocus}
                  defaultValue={field.default}
                  onChange={(e) => setValues({ ...values, [name]: e.target.value })}
                />
                : ['userId', 'username', 'user'].includes(field.type)
                  ? <UserSelectAutoComplete
                    data-autofocus={field.autofocus}
                    ref={(el) => { refs.current[name] = el; }}
                    selectedKeys={selected[name] ? [selected[name].toString()] : []}
                    onChange={(e) => {
                      const val = refs.current[name].getSelectedItems()[0];
                      setValues({ ...values, [name]: field.type === 'username' ? val.uname : field.type === 'userId' ? val._id : val });
                      setSelected({ ...selected, [name]: e });
                    }}
                  />
                  : <DomainSelectAutoComplete
                    data-autofocus={field.autofocus}
                    selectedKeys={values[name] ? [values[name]] : []}
                    onChange={(e) => setValues({ ...values, [name]: e })}
                  />}
            </div>
          </label>}
          {field.type === 'checkbox' && <label className="checkbox">
            <input
              type="checkbox"
              defaultChecked={field.default === 'true'}
              onChange={(e) => setValues({ ...values, [name]: !!e.target.checked })}
            />
            {field.label}
          </label>}
        </div>
      </div>)}
    </div>;
  };
  const div = document.createElement('div');
  const root = ReactDOM.createRoot(div);
  root.render(<Component />);
  const res = await new Dialog({
    $body: $(div),
    $action: [buttonCancel, buttonOk].join('\n'),
    onDispatch(action) {
      if (action === 'ok') {
        for (const [name, field] of Object.entries(fields)) {
          if ((field as any).required && !valueCache[name]) return false;
        }
      }
      return true;
    },
  }).open();
  root.unmount();
  if (res !== 'ok') return null;
  return valueCache;
}

export async function confirm(text: string) {
  const res = await new ConfirmDialog({
    $body: tpl.typoMsg(text),
  }).open();
  return res === 'yes';
}

export async function alert(text: string) {
  return await new InfoDialog({
    $body: tpl.typoMsg(text),
  }).open();
}

window.Hydro.components.Dialog = Dialog;
window.Hydro.components.InfoDialog = InfoDialog;
window.Hydro.components.ActionDialog = ActionDialog;
window.Hydro.components.ConfirmDialog = ConfirmDialog;
window.Hydro.components.prompt = prompt;
window.Hydro.components.confirm = confirm;
window.Hydro.components.alert = alert;
