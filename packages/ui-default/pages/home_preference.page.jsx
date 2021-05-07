import { NamedPage } from 'vj/misc/Page';
import load from 'vj/components/wastyle/index';
import code from 'vj/components/highlighter/code-example';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

const page = new NamedPage('home_preference', async () => {
  async function mountComponent() {
    const [{ default: prismjs }, [success, format], React, { render }] = await Promise.all([
      import('vj/components/highlighter/prismjs'),
      load(),
      import('react'),
      import('react-dom'),
    ]);

    class AstylePreview extends React.PureComponent {
      constructor(props) {
        super(props);
        this.state = { value: UserContext.astyleOptions };
        [this.success, this.preview] = format(code, `${this.state.value.trim()} mode=c`);
        this.state.highlight = this.success
          ? prismjs.highlight(this.preview, prismjs.Prism.languages.cpp, 'C++')
          : prismjs.highlight(this.preview, prismjs.Prism.languages.cpp, 'C++');
      }

      render() {
        return (
          <>
            <div className="medium-4 columns form__item end">
              <label htmlFor="astyleOptions_input">
                {i18n('astyleOptions')}
                <div id="astyleOptions_input" name="form_item_astyleOptions" className="textbox-container">
                  <textarea
                    type="textarea"
                    spellCheck={false}
                    name="astyleOptions"
                    value={this.state.value}
                    style={{ height: '400px' }}
                    onChange={(ev) => {
                      ev.stopPropagation();
                      [this.success, this.preview] = format(code, `${ev.target.value.trim()} mode=c`);
                      const highlight = this.success
                        ? prismjs.highlight(this.preview, prismjs.Prism.languages.cpp, 'C++')
                        : prismjs.highlight(this.preview, prismjs.Prism.languages.cpp, 'C++');
                      this.setState({ value: ev.target.value, highlight });
                    }}
                    className="textbox"
                  />
                </div>
              </label>
              <p className="help-text">{i18n('astyle formatting options')}</p>
            </div>
            <div className="medium-8 columns form__item end">
              <label htmlFor="astylePreview">
                {i18n('Preview') /* eslint-disable-next-line */}
                <pre id="astylePreview" style={{ height: '400px' }}><code dangerouslySetInnerHTML={{ __html: this.state.highlight }}></code></pre>
              </label>
            </div>
          </>
        );
      }
    }

    function setOptions($el, options) {
      $el.empty();
      $.each(options, (key, value) => {
        $el.append($('<option></option>').attr('value', key).text(value));
      });
    }

    const $el = $(tpl`\
<div class="row">
  <div class="medium-5 columns form__item end">
    <label>
      ${i18n('Code language')}
      <div name="form_item_lang" class="select-container">
        <select id="codelang-main-select" class="select"></select>
      </div>
    </label>
  </div>
  <div class="medium-5 columns form__item end" style="display: none" id="codelang-sub-container">
    <label>
      ${i18n('Code language')}
      <div name="form_item_lang" class="select-container">
        <select id="codelang-sub-select" class="select"></select>
      </div>
    </label>
  </div>
</div>
`);
    $('[name="codeLang"]')
      .parent().parent().parent()
      .parent()
      .hide()
      .after($el);

    $('#codelang-main-select').on('change', function () {
      $('[name="codeLang"]').val(this.value);
      const options = {};
      for (const key in window.LANGS) {
        if (key.startsWith(`${this.value}.`) && key !== this.value) options[key] = window.LANGS[key].display;
      }
      if (Object.keys(options).length > 1) {
        setOptions($('#codelang-sub-select'), options);
        $('#codelang-sub-container').show();
      } else $('#codelang-sub-container').hide();
    });
    $('#codelang-sub-select').on('change', function () {
      $('[name="codeLang"]').val(this.value);
    });
    const main = {};
    for (const key in window.LANGS) {
      if (!key.includes('.')) main[key] = window.LANGS[key].display;
    }
    setOptions($('#codelang-main-select'), main);
    const current = $('[name="codeLang"]').val();
    console.log(current);
    if (current.includes('.')) {
      const [m, s] = current.split('.');
      $('#codelang-main-select').val(m);
      $('#codelang-sub-select').val(s);
    } else $('#codelang-main-select').val(current);

    if (success) {
      render(
        <AstylePreview></AstylePreview>,
        $('[name="form_item_astyleOptions"]').get(0).parentNode.parentNode.parentNode,
      );
    }
  }

  mountComponent();
});

export default page;
