import { NamedPage } from 'vj/misc/Page';
import load from 'vj/components/wastyle/index';
import code from 'vj/components/highlighter/code-example';
import i18n from 'vj/utils/i18n';

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
