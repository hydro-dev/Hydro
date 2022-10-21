import _ from 'lodash';

type Substitution = string | number | { templateRaw: true, html: string };

export default function tpl(pieces: TemplateStringsArray, ...substitutions: Substitution[]) {
  let result = pieces[0];
  for (let i = 0; i < substitutions.length; ++i) {
    const subst = substitutions[i];
    let substHtml: string;
    if (typeof subst === 'object' && subst.templateRaw) {
      substHtml = subst.html;
    } else substHtml = _.escape(String(subst));
    result += substHtml + pieces[i + 1];
  }
  return result;
}

tpl.typoMsg = function (msg: string, raw = false) {
  if (raw) return `<div class="typo"><p>${msg}</p></div>`;
  const lines = msg.trim().split('\n');
  return `<div class="typo">${lines.map((i) => `<p>${_.escape(i)}</p>`).join('\n')}</div>`;
};

export function rawHtml(html: string) {
  return {
    templateRaw: true,
    html,
  };
}

window.Hydro.utils.tpl = tpl;
