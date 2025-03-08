import 'element-plus/dist/index.css';
import '@undefined-moe/schemastery-vue/lib/schemastery-vue.css';

import yaml from 'js-yaml';
import React from 'react';
import ReactDOM from 'react-dom/client';
import Schema from 'schemastery';
import { applyPureReactInVue, applyVueInReact, createReactMissVue } from 'veaury';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request } from 'vj/utils';

const locales = {
  zh: 'zh-CN',
  en: 'en-US',
};

const page = new NamedPage('manage_config', async () => {
  const [{ default: form }, { createI18n }, ElementPlus, { load }] = await Promise.all([
    import('@undefined-moe/schemastery-vue/lib/schemastery-vue.esm') as Promise<typeof import('@undefined-moe/schemastery-vue/src/index.ts')>,
    import('vue-i18n'),
    import('element-plus'),
    import('vj/components/monaco/loader'),
  ]);
  const { monaco, registerAction, renderMarkdown } = await load(['yaml']);
  const KForm = applyVueInReact(form.Form) as any;

  function MarkdownContainer(props) {
    const rendered = React.useMemo(() => {
      const res = renderMarkdown({ value: props.source });
      const value = res.element.innerHTML;
      res.dispose();
      return value;
    }, [props.source]);
    return <div dangerouslySetInnerHTML={{ __html: rendered }} />;
  }
  const [, ReactMissVue] = createReactMissVue({
    useVueInjection() {
      return {};
    },
    beforeVueAppMount(app: any) {
      app.use(form);
      app.use(createI18n({
        legacy: false,
        locale: locales[i18n('__id')] || 'en-US',
      }));
      app.use(ElementPlus);
      app.component('k-markdown', applyPureReactInVue(MarkdownContainer));
    },
  });
  const initialConfigString = UiContext.config;
  const schema = new Schema(UiContext.schema);
  const initial = yaml.load(UiContext.config);

  function MonacoContainer({ config, setValue, setError }) {
    const editorRef = React.useRef<HTMLDivElement>(null);
    const [loading, setLoading] = React.useState(false);
    const [editor, setEditor] = React.useState<any>(null);

    React.useEffect(() => {
      const listener = () => {
        if (!editor) return;
        editor.layout();
      };
      document.addEventListener('resize', listener);
      return () => document.removeEventListener('resize', listener);
    }, [editor]);
    React.useEffect(() => {
      if (!editorRef.current || loading) return;
      setLoading(true);
      const model = monaco.editor.createModel(config, 'yaml', monaco.Uri.parse('hydro://system/setting.yaml'));
      const e = monaco.editor.create(editorRef.current, {
        theme: 'vs-light',
        lineNumbers: 'off',
        glyphMargin: true,
        lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.On },
        model,
        minimap: { enabled: false },
        hideCursorInOverviewRuler: true,
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        fontFamily: UserContext.codeFontFamily,
        fontLigatures: '',
        unicodeHighlight: {
          ambiguousCharacters: true,
        },
      });
      registerAction(e, model, editorRef.current);
      e.onDidChangeModelContent(() => {
        const val = e.getValue({ lineEnding: '\n', preserveBOM: false });
        try {
          const loaded = yaml.load(val);
          schema(loaded);
          setValue(val);
          setError('');
        } catch (err) {
          setError(err.message);
        }
      });
      setEditor(e);
    }, [editorRef.current]);
    React.useEffect(() => {
      if (!editor) return;
      const current = editor.getValue({ lineEnding: '\n', preserveBOM: false });
      if (current !== config) editor.setValue(config);
    }, [editor, config]);
    return (
      <div ref={editorRef} style={{
        width: '100%', height: '500px',
      }} />
    );
  }

  const initialClone = JSON.parse(JSON.stringify(initial));
  function App() {
    const [value, setValue] = React.useState(initialClone);
    const [info, setInfo] = React.useState('');
    const [stringConfig, setStringConfig] = React.useState(initialConfigString);

    const updateFromForm = React.useCallback((v) => {
      const newDump = yaml.dump(v);
      if (newDump === stringConfig) return;
      console.log('update.form', newDump);
      setStringConfig(newDump);
      setValue(v);
    }, [stringConfig]);
    const updateFromMonaco = React.useCallback((v) => {
      if (v === stringConfig) return;
      console.log('update.monaco', v);
      setStringConfig(v);
      setValue(yaml.load(v));
    }, [stringConfig]);

    return <ReactMissVue>
      <div className="row">
        <KForm className="medium-7 columns" schema={schema} initial={initial} v-model={[value, updateFromForm]} />
        <div className="medium-4 columns">
          <MonacoContainer config={stringConfig} setValue={updateFromMonaco} setError={setInfo} />
          <pre className="help-text">{info}</pre>
        </div>
      </div>
      <div className="row" style={{ marginTop: '20px' }}>
        <div className="medium-10 columns">
          <button onClick={() => {
            request.post('', { value: stringConfig }).then(() => {
              Notification.success('保存成功');
            }).catch((e) => {
              Notification.error('保存失败:', e.message);
            });
          }} className="rounded primary button">{i18n('Save All Changes')}</button>
        </div>
      </div>
    </ReactMissVue>;
  }

  ReactDOM.createRoot(document.getElementById('app')!).render(<App />);
});

export default page;
