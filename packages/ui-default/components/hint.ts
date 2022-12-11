import $ from 'jquery';
import { InfoDialog } from 'vj/components/dialog';
import { i18n, tpl } from 'vj/utils';

export default function createHint(message: string, element?: any) {
  if (i18n(message) === message || !element) return;
  const a = document.createElement('a');
  a.setAttribute('href', 'javascript:;');
  const span = document.createElement('span');
  span.setAttribute('class', 'icon icon-help');
  a.appendChild(span);
  a.onclick = () => {
    new InfoDialog({
      cancelByClickingBack: false,
      $body: tpl.typoMsg(i18n(message), true),
    }).open();
  };
  $(element).append(a);
}
