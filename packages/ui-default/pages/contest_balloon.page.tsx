/* eslint-disable react-refresh/only-export-components */
import { getAlphabeticId } from '@hydrooj/utils/lib/common';
import yaml from 'js-yaml';
import React from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, pjax, request, tpl,
} from 'vj/utils';

function Balloon({ tdoc, val }) {
  const [color, setColor] = React.useState('');
  const [now, setNow] = React.useState('');
  return (
    <div className="row">
      <div className="medium-12 columns">
        <table className="data-table">
          <thead>
            <tr>
              <th>{i18n('Problem')}</th>
              <th>{i18n('Color')}</th>
              <th>{i18n('Name')}</th>
              <th><span className="icon icon-wrench"></span></th>
            </tr>
          </thead>
          <tbody>
            {tdoc.pids.map((pid) => {
              const { color: c, name } = val[+pid];
              return (
                <tr key={pid}>
                  <td>
                    {now === pid
                      ? (<b>{getAlphabeticId(tdoc.pids.indexOf(+pid))}</b>)
                      : (<span>{getAlphabeticId(tdoc.pids.indexOf(+pid))}</span>)}
                  </td>
                  <td>
                    <HexColorInput
                      className="textbox"
                      color={c}
                      onFocus={() => { setNow(pid); setColor(c); }}
                      onChange={(e) => { val[+pid].color = e; setColor(e); }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="textbox"
                      defaultValue={name}
                      onFocus={() => { setNow(pid); setColor(c); }}
                      onChange={(e) => { val[+pid].name = e.target.value; }}
                    />
                  </td>
                  {tdoc.pids.indexOf(+pid) === 0 && <td rowSpan={0}>
                    {now && <HexColorPicker color={color} onChange={(e) => { val[+now].color = e; setColor(e); }} style={{ padding: '1rem' }} />}
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function handleSetColor(tdoc) {
  const val = tdoc.balloon || {};
  for (const pid of tdoc.pids) val[+pid] ||= { color: '#ffffff', name: '' };
  Notification.info(i18n('Loading...'));
  const action = await new ActionDialog({
    $body: tpl(<>
      <div className="row"><div className="columns">
        <h1>{i18n('Set Color')}</h1>
      </div></div>
      <Balloon tdoc={tdoc} val={val} />
    </>, true),
  }).open();
  if (action !== 'ok') return;
  Notification.info(i18n('Updating...'));
  try {
    await request.post('', { operation: 'set_color', color: yaml.dump(val) });
  } catch (e) {
    Notification.error(`${e.message} ${e.params?.[0]}`);
  }
  Notification.info(i18n('Successfully updated.'));
  pjax.request({ url: '', push: false });
}

const page = new NamedPage('contest_balloon', () => {
  const { tdoc } = UiContext;

  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  function update() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) pjax.request({ url: '', push: false });
  }

  $('[name="set_color"]').on('click', () => handleSetColor(tdoc));
  setInterval(update, 60000);

  $(document).on('click', '[value="done"]', async (ev) => {
    ev.preventDefault();
    const balloon = $(ev.currentTarget).data('balloon');
    try {
      await request.post('', { balloon, operation: 'done' });
    } catch (e) {
      Notification.error(`${e.message} ${e.params?.[0]}`);
    }
    Notification.info(i18n('Successfully updated.'));
    pjax.request({ url: '', push: false });
  });
});

export default page;
