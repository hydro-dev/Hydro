import $ from 'jquery';
import React from 'react';
import DomainSelectAutoComplete from 'vj/components/autocomplete/DomainSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { i18n, tpl } from 'vj/utils';

export default new NamedPage('home_domain', () => {
  $(tpl(
    <div style={{ display: 'none' }} className="dialog__body--join-domain" id="join-domain-dialog">
      <div className="row"><div className="columns">
        <h1>{i18n('Join Domain')}</h1>
      </div></div>
      <div className="row">
        <div className="columns">
          <label>
            {i18n('Domain ID')}
            <div className="textbox-container">
              <input name="domainId" type="text" className="textbox" data-autofocus />
            </div>
          </label>
        </div>
      </div>
    </div>,
  )).appendTo(document.body);
  const selector: any = DomainSelectAutoComplete.getOrConstruct($('#join-domain-dialog [name="domainId"]'));

  $(document).on('click', '[id="join-domain-button"]', async () => {
    const action = await new ActionDialog({
      $body: $('.dialog__body--join-domain > div'),
      onDispatch(a) {
        if (a === 'ok' && selector.value() === null) {
          selector.focus();
          return false;
        }
        return true;
      },
    }).open();
    if (action !== 'ok') return;
    window.location.href = `/domain/join?target=${encodeURIComponent(selector.value()._id.toString())}`;
  });
});
