import React from 'react';
import { confirm } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import { i18n } from 'vj/utils';
import SectionItem from './SectionItem';
import { TrainingFormData, TrainingNode } from './types';

const LARGE_TRAINING_THRESHOLD = 20;

interface TrainingEditorProps {
  initialData: TrainingFormData;
}

export default function TrainingEditor({ initialData }: TrainingEditorProps) {
  const [formData, setFormData] = React.useState<TrainingFormData>(initialData);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [advancedJson, setAdvancedJson] = React.useState('');

  const descriptionContainerRef = React.useRef<HTMLDivElement>(null);
  const advancedContainerRef = React.useRef<HTMLDivElement>(null);
  const descriptionRef = React.useRef<HTMLTextAreaElement>(null);
  const advancedEditorRef = React.useRef<HTMLTextAreaElement>(null);
  const editorInitialized = React.useRef(false);
  const advancedEditorInitialized = React.useRef(false);

  const isLargeTraining = initialData.dag.length >= LARGE_TRAINING_THRESHOLD;

  React.useEffect(() => {
    const form = document.getElementById('TrainingForm') as HTMLFormElement | null;
    if (!form) return;
    const titleInput = form.querySelector('input[name="title"]') as HTMLInputElement | null;
    const pinInput = form.querySelector('input[name="pin"]') as HTMLInputElement | null;
    const contentTextarea = form.querySelector('textarea[name="content"]') as HTMLTextAreaElement | null;
    const dagTextarea = form.querySelector('textarea[name="dag"]') as HTMLTextAreaElement | null;
    if (titleInput) titleInput.value = formData.title;
    if (pinInput) pinInput.value = String(formData.pin);
    if (contentTextarea) contentTextarea.value = formData.content;
    if (dagTextarea) dagTextarea.value = JSON.stringify(formData.dag);
  }, [formData]);

  React.useEffect(() => {
    const syncDescription = () => {
      const form = document.getElementById('TrainingForm') as HTMLFormElement | null;
      if (!form) return;
      const descTextarea = form.querySelector('textarea[name="description"]') as HTMLTextAreaElement | null;
      if (descTextarea && descriptionRef.current) {
        descTextarea.value = descriptionRef.current.value;
      }
    };
    const descEl = descriptionRef.current;
    if (descEl) {
      descEl.addEventListener('blur', syncDescription);
      descEl.addEventListener('change', syncDescription);
    }
    const form = document.getElementById('TrainingForm') as HTMLFormElement | null;
    if (form) {
      form.addEventListener('submit', syncDescription);
    }
    return () => {
      if (descEl) {
        descEl.removeEventListener('blur', syncDescription);
        descEl.removeEventListener('change', syncDescription);
      }
      if (form) {
        form.removeEventListener('submit', syncDescription);
      }
    };
  }, []);

  React.useEffect(() => {
    if (descriptionContainerRef.current && !editorInitialized.current) {
      editorInitialized.current = true;
      const $ = (window as any).$;
      setTimeout(() => $(descriptionContainerRef.current).trigger('vjContentNew'), 0);
    }
  }, []);

  React.useEffect(() => {
    if (showAdvanced && advancedContainerRef.current && !advancedEditorInitialized.current) {
      advancedEditorInitialized.current = true;
      const $ = (window as any).$;
      setTimeout(() => $(advancedContainerRef.current).trigger('vjContentNew'), 0);
    }
  }, [showAdvanced]);

  React.useEffect(() => {
    if (showAdvanced) setAdvancedJson(JSON.stringify(formData.dag, null, 2));
  }, [showAdvanced, formData.dag]);

  const updateFormField = React.useCallback(<K extends keyof TrainingFormData>(field: K, value: TrainingFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const addSection = React.useCallback(() => {
    setFormData((prev) => {
      const newId = prev.dag.length > 0 ? Math.max(...prev.dag.map((n) => n._id)) + 1 : 1;
      return { ...prev, dag: [...prev.dag, { _id: newId, title: `${i18n('Section')} ${newId}`, requireNids: [], pids: [] }] };
    });
  }, []);

  const updateSection = React.useCallback((nodeId: number, updates: Partial<TrainingNode>) => {
    setFormData((prev) => ({
      ...prev,
      dag: prev.dag.map((node) => (node._id === nodeId ? { ...node, ...updates } : node)),
    }));
  }, []);

  const deleteSection = React.useCallback(async (nodeId: number) => {
    if (!await confirm(i18n('Are you sure you want to delete this section?'))) return;
    setFormData((prev) => ({ ...prev, dag: prev.dag.filter((node) => node._id !== nodeId) }));
  }, []);

  const moveSection = React.useCallback((fromIndex: number, toIndex: number) => {
    setFormData((prev) => {
      if (toIndex < 0 || toIndex >= prev.dag.length) return prev;
      const newDag = [...prev.dag];
      const [removed] = newDag.splice(fromIndex, 1);
      newDag.splice(toIndex, 0, removed);
      return { ...prev, dag: newDag };
    });
  }, []);

  const handleApplyJson = React.useCallback(() => {
    const jsonValue = advancedEditorRef.current?.value;
    if (!jsonValue) return;
    try {
      const parsed = JSON.parse(jsonValue);
      if (!Array.isArray(parsed)) {
        Notification.error(i18n('Invalid JSON format: must be an array'));
        return;
      }
      setFormData((prev) => ({ ...prev, dag: parsed }));
      Notification.success(i18n('JSON applied to editor'));
    } catch {
      Notification.error(i18n('Invalid JSON format'));
    }
  }, []);

  const toggleAdvanced = React.useCallback(() => setShowAdvanced((s) => !s), []);

  return (
    <>
      <div className="section__header"><h2 className="section__title">{i18n('Basic Information')}</h2></div>
      <div className="section__body">
        <div className="row">
          <div className="medium-9 columns form__item">
            <label>
              {i18n('Title')}
              <input
              type="text"
              className="textbox"
              value={formData.title}
                onChange={(e) => updateFormField('title', e.target.value)}
                placeholder={i18n('title')}
                required
                autoFocus />
            </label>
          </div>
          <div className="medium-3 columns form__item end">
            <label>
              {i18n('Pin')}
              <input
              type="number"
              className="textbox"
              value={formData.pin}
                onChange={(e) => updateFormField('pin', Number.parseInt(e.target.value, 10) || 0)}
                min={0} />
            </label>
          </div>
        </div>
        <div className="row"><div className="columns form__item">
          <label>
            {i18n('Introduce')}
            <textarea className="textbox" value={formData.content} onChange={(e) => updateFormField('content', e.target.value)} />
            <p className="help-text">{i18n('Introduce must not exceed 500 characters and it will be shown in the list view.')}</p>
          </label>
        </div></div>
        <div className="row"><div className="columns form__item" ref={descriptionContainerRef}>
          <label>
            {i18n('Description')}
            <textarea
            ref={descriptionRef}
            className="textbox"
            defaultValue={initialData.description}
              style={{ height: '200px' }}
              data-markdown />
          </label>
        </div></div>
      </div>

      <div className="section__header">
        <h2 className="section__title">{i18n('Training Sections')}</h2>
        <div className="section__tools">
          <button type="button" className="rounded primary button" onClick={addSection}>
            <span className="icon icon-add" /> {i18n('Add Section')}
          </button>
        </div>
      </div>
      <div className="section__body">
        {formData.dag.length === 0 ? (
          <div className="training-editor__empty">
            <p className="training-editor__empty-text">{i18n('No sections yet. Click the button above to add your first section.')}</p>
            <button type="button" className="rounded primary button" onClick={addSection}>
              <span className="icon icon-add" /> {i18n('Add First Section')}
            </button>
          </div>
        ) : (
          formData.dag.map((node, idx) => (
            <SectionItem
              key={node._id}
              node={node}
              index={idx}
              totalSections={formData.dag.length}
              allSections={formData.dag}
              defaultCollapsed={isLargeTraining}
              onUpdate={updateSection}
              onDelete={deleteSection}
              onMoveUp={() => moveSection(idx, idx - 1)}
              onMoveDown={() => moveSection(idx, idx + 1)}
            />
          ))
        )}
      </div>

      <div className="section__header" style={{ paddingTop: 0 }}>
        <h2 className="section__title">{i18n('Advanced')}</h2>
        <div className="section__tools">
          <button type="button" className="link" onClick={toggleAdvanced}>
            {showAdvanced ? i18n('Hide') : i18n('Show')} {i18n('JSON Editor')}
          </button>
        </div>
      </div>
      {showAdvanced && (
        <div className="section__body" ref={advancedContainerRef}>
          <div className="row"><div className="columns form__item">
            <label>
              {i18n('Plan')}
              <textarea ref={advancedEditorRef} className="textbox" defaultValue={advancedJson} style={{ height: '400px' }} data-json />
              <p className="help-text">{i18n('Edit JSON and click "Apply to Editor" to update the visual editor above.')}</p>
            </label>
            <button type="button" className="rounded button" onClick={handleApplyJson} style={{ marginTop: '8px' }}>
              {i18n('Apply to Editor')}
            </button>
          </div></div>
        </div>
      )}
    </>
  );
}
