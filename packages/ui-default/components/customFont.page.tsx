import { CustomSelectAutoComplete } from '@hydrooj/components';
import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, tpl } from 'vj/utils';
import { ActionDialog } from './dialog';

async function getAvailableFonts() {
  const fonts = await (window as any).queryLocalFonts();
  const result = {};
  for (const font of fonts) result[font.family] ||= font.fullName;
  return Object.entries(result).map(([family, fullName]) => ({
    id: family,
    name: family === fullName ? family : `${fullName} (${family})`,
    fullName,
  }));
}

const customFont = localStorage.getItem('customFont');
const customCodeFont = localStorage.getItem('customCodeFont');

export default new AutoloadPage('customFont', (pageName) => {
  let dialog;
  let selection = '';
  let handle = null;

  async function showDialog(saveKey: string) {
    if (!dialog) {
      const fonts = await getAvailableFonts();
      dialog = new ActionDialog({
        $body: $(tpl(
          <CustomSelectAutoComplete
            ref={(el) => { handle = el; }}
            allowEmptyQuery={false}
            data={fonts}
            renderItem={(item) => <div style={{ fontFamily: item.id }}>{item.name}</div>}
          />, true,
        )),
        onDispatch: (action) => {
          selection = handle.getSelectedItems()?.[0]?.id;
          return action !== 'ok' || selection;
        },
        cancelByEsc: false,
        cancelByClickingBack: false,
      });
    }
    dialog.open().then((action) => {
      console.log(action, saveKey, selection);
      if (action === 'ok') {
        localStorage.setItem(saveKey, selection);
        window.location.reload();
      } else {
        localStorage.removeItem(saveKey);
      }
    });
  }

  function FontSelectButton(props: { saveKey: string, label: string, value: string }) {
    return <div className="medium-6 columns"><label>
      {i18n(props.label)}
      <div><button className="button inline" data-show-font-dialog={props.saveKey}>
        {props.value ? i18n('Using custom font: {0}', props.value) : i18n('Find custom font')}
      </button></div>
    </label></div>;
  }

  if (pageName === 'home_preference' && 'queryLocalFonts' in window) {
    $('[name="form_item_fontFamily"]').parent().parent().parent().append($(tpl(
      <FontSelectButton saveKey="customFont" label="Select Custom Font" value={customFont} />,
    )));
    $('[name="form_item_codeFontFamily"]').parent().parent().parent().append($(tpl(
      <FontSelectButton saveKey="customCodeFont" label="Select Custom Code Font" value={customCodeFont} />,
    )));
    $(document).on('click', '[data-show-font-dialog]', (ev) => {
      ev.preventDefault();
      showDialog(ev.target.dataset.showFontDialog);
    });
  }
}, () => {
  const fontBlock = Array.from(document.head.children).find((el) => el.tagName === 'STYLE' && el.textContent?.includes('--code-font-family'));
  if (fontBlock) {
    if (customFont) {
      fontBlock.textContent = fontBlock.textContent?.replace(/--font-family:/, `--font-family: "${customFont}", `);
    }
    if (customCodeFont) {
      fontBlock.textContent = fontBlock.textContent?.replace(/--code-font-family:/, `--code-font-family: "${customCodeFont}", `);
    }
  } else {
    console.warn('No font style block found');
  }
});
