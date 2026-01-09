import React from 'react';
import { confirm } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import { i18n } from 'vj/utils';
import SectionItem from './SectionItem';
import { TrainingFormData, TrainingNode } from './types';

const LARGE_TRAINING_THRESHOLD = 20;

interface TrainingEditorProps {
  initialData: TrainingFormData;
  isEdit: boolean;
  onSubmit: (data: TrainingFormData) => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

export default function TrainingEditor({ initialData, isEdit, onSubmit, onDelete, canDelete }: TrainingEditorProps) {
  const [formData, setFormData] = React.useState<TrainingFormData>(initialData);
  const [loading, setLoading] = React.useState(false);
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

  const handleSubmit = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const currentDescription = descriptionRef.current?.value ?? formData.description;
    const submitData = { ...formData, description: currentDescription };
    if (submitData.dag.length === 0) {
      Notification.error(i18n('Please add at least one section'));
      return;
    }
    if (submitData.dag.find((node) => node.pids.length === 0)) {
      Notification.error(i18n('Each section must have at least one problem'));
      return;
    }
    setLoading(true);
    try {
      await onSubmit(submitData);
    } finally {
      setLoading(false);
    }
  }, [formData, onSubmit]);

  const handleDelete = React.useCallback(async () => {
    if (!onDelete) return;
    if (!await confirm(i18n('Confirm deleting this training? Its files and status will be deleted as well.'))) return;
    onDelete();
  }, [onDelete]);

  const toggleAdvanced = React.useCallback(() => setShowAdvanced((s) => !s), []);

  return (
    <form onSubmit={handleSubmit}>
      <div className="section__header"><h2 className="section__title">{i18n('Basic Information')}</h2></div>
      <div className="section__body">
        <div className="row">
          <div className="medium-9 columns form__item">
            <label>
              {i18n('Title')}
              <input type="text" className="textbox" name="title" value={formData.title}
                onChange={(e) => updateFormField('title', e.target.value)} placeholder={i18n('title')} required autoFocus />
            </label>
          </div>
          <div className="medium-3 columns form__item end">
            <label>
              {i18n('Pin')}
              <input type="number" className="textbox" name="pin" value={formData.pin}
                onChange={(e) => updateFormField('pin', Number.parseInt(e.target.value, 10) || 0)} min={0} />
            </label>
          </div>
        </div>
        <div className="row"><div className="columns form__item">
          <label>
            {i18n('Introduce')}
            <textarea className="textbox" name="content" value={formData.content} onChange={(e) => updateFormField('content', e.target.value)} />
            <p className="help-text">{i18n('Introduce must not exceed 500 characters and it will be shown in the list view.')}</p>
          </label>
        </div></div>
        <div className="row"><div className="columns form__item" ref={descriptionContainerRef}>
          <label>
            {i18n('Description')}
            <textarea ref={descriptionRef} className="textbox" name="description" defaultValue={initialData.description}
              style={{ height: '200px' }} data-markdown />
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
          <div style={{ textAlign: 'center', padding: '2rem', background: '#f8f9fa', borderRadius: '4px', border: '2px dashed #ddd' }}>
            <p style={{ color: '#666', marginBottom: '1rem' }}>{i18n('No sections yet. Click the button above to add your first section.')}</p>
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

      <div className="row" style={{ marginTop: '1.5rem' }}><div className="columns">
        <button type="submit" className="rounded primary button" disabled={loading}>
          {loading ? i18n('Processing...') : i18n(isEdit ? 'Update' : 'Create')}
        </button>
        {isEdit && canDelete && <button type="button" className="rounded button" onClick={handleDelete}>{i18n('Delete')}</button>}
        <button type="button" className="rounded button" onClick={() => window.history.back()}>{i18n('Cancel')}</button>
      </div></div>
    </form>
  );
}
