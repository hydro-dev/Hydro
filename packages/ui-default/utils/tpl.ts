import _ from 'lodash';

type Substitution = string | { templateRaw: true, html: string };

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
  return tpl`
    <div class="typo">
      <p>${raw ? { html: msg, templateRaw: true } : msg}</p>
    </div>
  `;
};

export function rawHtml(html: string) {
  return {
    templateRaw: true,
    html,
  };
}

global.Hydro.utils.tpl = tpl;
