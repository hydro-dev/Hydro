import _ from 'lodash';

export default function tpl(pieces, ...substitutions) {
  let result = pieces[0];
  for (let i = 0; i < substitutions.length; ++i) {
    const subst = substitutions[i];
    let substHtml;
    if (typeof subst === 'object' && subst.templateRaw) {
      substHtml = subst.html;
    } else substHtml = _.escape(String(subst));
    result += substHtml + pieces[i + 1];
  }
  return result;
}

tpl.typoMsg = function (msg) {
  return tpl`
    <div class="typo">
      <p>${msg}</p>
    </div>
  `;
};

export function rawHtml(html) {
  return {
    templateRaw: true,
    html,
  };
}

global.Hydro.utils.tpl = tpl;
