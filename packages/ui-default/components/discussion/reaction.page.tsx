/* eslint-disable react-refresh/only-export-components */
import 'jquery.easing';

import { MantineProvider, Popover } from '@mantine/core';
import $ from 'jquery';
import { chunk } from 'lodash';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { AutoloadPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

function renderReactions(reactions = {}, self = {}, rootEle) {
  let html = '';
  for (const [k, v] of Object.entries(reactions).sort(([, v1], [, v2]) => +v2 - +v1)) {
    if (!v) continue;
    html += `<div class="reaction${self[k] ? ' active' : ''}""><span class="emoji">${k}</span> ${v}</div>\n`;
  }
  rootEle.html(html);
}

async function handleEmojiClick(payload, emoji, ele) {
  const res = await request.post('', { ...payload, emoji });
  if (!res.sdoc) return;
  renderReactions(res.doc?.react, res.sdoc.react, ele);
}

function getRow(count) {
  if (count <= 2) return 2;
  if (count <= 3) return 3;
  if (count <= 4) return 4;
  if (count <= 6) return 6;
  return 12;
}

function Reaction({ payload, ele }) {
  const emojiList: string[] = (UiContext.emojiList || '👍 👎 😄 😕 ❤️ 🤔 🤣 🌿 🍋 🕊️ 👀 🤡').split(' ');
  const elesPerRow = getRow(Math.sqrt(emojiList.length));
  const [focus, updateFocus] = React.useState(false);
  const [open, updateOpen] = React.useState(false);
  const [trigger, updateTrigger] = React.useState(false);
  return (
    <Popover opened={trigger || open || focus}>
      <Popover.Target>
        <span
          className="icon icon-emoji"
          onMouseEnter={() => updateTrigger(true)}
          onMouseLeave={() => {
            setTimeout(() => updateTrigger(false), 300);
          }}
        />
      </Popover.Target>
      <Popover.Dropdown onMouseEnter={() => updateOpen(true)} onMouseLeave={() => updateOpen(false)}>
        {chunk(emojiList, elesPerRow).map((line, i) => (
          <div className="row" key={+i} style={{ paddingBottom: 4, paddingTop: 4 }}>
            {line.map((emoji) => (
              <div
                key={emoji}
                className={`medium-${12 / elesPerRow} small-${12 / elesPerRow} columns popover-reaction-item`}
                onClick={() => handleEmojiClick(payload, emoji, ele).then(() => {
                  updateOpen(false);
                  updateTrigger(false);
                })}
              >
                {emoji}
              </div>
            ))}
          </div>
        ))}
        <div className="row" style={{ paddingTop: 7, paddingBottom: 4 }}>
          <div className="medium-12 columns">
            <input name="emojiSuggest" onFocus={() => updateFocus(true)} onBlur={() => updateFocus(false)}></input>
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

const reactionPage = new AutoloadPage('reactionPage', () => {
  const canUseReaction = $('[data-op="react"]').length > 0;
  $('[data-op="react"]').each((i, e) => {
    ReactDOM.createRoot(e).render(<MantineProvider>
      <Reaction payload={$(e).data('form')} ele={$(`.reactions[data-${$(e).data('form').nodeType}='${$(e).data('form').id}']`)} />
    </MantineProvider>);
  });
  $(document).on('click', '.reaction', async (e) => {
    if (!canUseReaction) {
      (window as any).showSignInDialog();
      return;
    }
    const target = $(e.currentTarget);
    const res = await request.post('', {
      operation: 'reaction',
      nodeType: target.parent().data('type'),
      id: target.parent().data(target.parent().data('type')),
      emoji: target.text().trim().split(' ')[0],
      reverse: target.hasClass('active'),
    });
    renderReactions(res.doc?.react, res.sdoc?.react, target.parent());
  });
});

export default reactionPage;
