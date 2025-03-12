import 'schemastery-react/lib/schemastery-react.css';

import { diffLines } from 'diff';
import yaml from 'js-yaml';
import React from 'react';
import ReactDOM from 'react-dom/client';
import Schema from 'schemastery';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request } from 'vj/utils';

const locales = {
  zh: 'zh-CN',
  en: 'en-US',
};

const page = new NamedPage('manage_config', async () => {
  const [{ createSchemasteryReact }, { load }] = await Promise.all([
    import('schemastery-react'),
    import('vj/components/monaco/loader'),
  ]);
  const { monaco, registerAction, renderMarkdown } = await load(['yaml']);

  const Form = createSchemasteryReact({
    locale: locales[i18n('__id')] || 'en-US',
    Markdown({ source }) {
      const rendered = React.useMemo(() => {
        const res = renderMarkdown({ value: source });
        const value = res.element.innerHTML;
        res.dispose();
        return value;
      }, [source]);
      // Markdown snippet come from trusted backend code, no need to sanitize here
      return <div dangerouslySetInnerHTML={{ __html: rendered }} />;
    },
  });

  setInterval(() => {
    monaco.editor.remeasureFonts();
  }, 1000);

  const initialConfigString = UiContext.config;
  const schema = new Schema(UiContext.schema);
  const initial = yaml.load(UiContext.config);

  function MonacoContainer({ config, setValue, setError }) {
    const editorRef = React.useRef<HTMLDivElement>(null);
    const [loading, setLoading] = React.useState(false);
    const [editor, setEditor] = React.useState<any>(null);
    const [model, setModel] = React.useState<any>(null);

    React.useEffect(() => {
      const listener = () => {
        if (!editor) return;
        editor.layout();
      };
      window.addEventListener('resize', listener);
      return () => window.removeEventListener('resize', listener);
    }, [editor]);
    React.useEffect(() => {
      if (!editor) return;
      const disposable = editor.onDidChangeModelContent(() => {
        const val = editor.getValue({ lineEnding: '\n', preserveBOM: false });
        try {
          const loaded = yaml.load(val);
          schema(loaded);
          setValue(val);
          setError('');
        } catch (err) {
          setError(err.message);
        }
      });
      return () => disposable.dispose(); // eslint-disable-line
    }, [editor, setValue, setError]);
    React.useEffect(() => {
      if (!editorRef.current || loading) return;
      setLoading(true);
      // eslint-disable-next-line
      const model = monaco.editor.createModel(config, 'yaml', monaco.Uri.parse('hydro://system/setting.yaml'));
      setModel(model);
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
      setEditor(e);
    }, [editorRef.current]);
    React.useEffect(() => {
      if (!editor) return;
      const current = editor.getValue({ lineEnding: '\n', preserveBOM: false });
      const diff = diffLines(current, config);
      const ops = [];
      let cursor = 1;
      for (const line of diff) {
        if (line.added) {
          let range = model.getFullModelRange();
          range = range.setStartPosition(cursor, 0);
          range = range.setEndPosition(cursor, 0);
          ops.push({ range, text: line.value });
        } else if (line.removed) {
          let range = model.getFullModelRange();
          range = range.setStartPosition(cursor, 0);
          cursor += line.count;
          range = range.setEndPosition(cursor, 0);
          ops.push({ range, text: '' });
        } else cursor += line.count;
      }
      model.pushEditOperations([], ops, undefined);
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
      setStringConfig(newDump);
      setValue(v);
    }, [stringConfig]);
    const updateFromMonaco = React.useCallback((v) => {
      if (v === stringConfig) return;
      setStringConfig(v);
      setValue(yaml.load(v));
    }, [stringConfig]);

    return (<>
      <div className="row">
        <div className="medium-5 columns">
          <MonacoContainer config={stringConfig} setValue={updateFromMonaco} setError={setInfo} />
          <pre className="help-text">{info}</pre>
        </div>
        <div className="medium-7 columns">
          <Form schema={schema} initial={initial} value={value} onChange={updateFromForm} />
        </div>
      </div>
      <div className="row" style={{ marginTop: '20px' }}>
        <div className="medium-10 columns">
          <button onClick={() => {
            request.post('', { value: stringConfig }).then(() => {
              Notification.success(i18n('Changes saved successfully'));
            }).catch((e) => {
              Notification.error(i18n('Failed to save changes:'), e.message);
            });
          }} className="rounded primary button">{i18n('Save All Changes')}</button>
        </div>
      </div>
    </>);
  }

  ReactDOM.createRoot(document.getElementById('app')!).render(<App />);
});

export default page;
