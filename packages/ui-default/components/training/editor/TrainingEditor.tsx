import type { ProblemDoc } from 'hydrooj/src/interface';
import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { confirm } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import { api, i18n } from 'vj/utils';
import SectionItem from './SectionItem';
import { TrainingFormData, TrainingNode } from './types';

interface TrainingEditorProps {
  initialData: TrainingFormData;
  isEdit: boolean;
  onSubmit: (data: TrainingFormData) => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

export default function TrainingEditor({
  initialData, isEdit, onSubmit, onDelete, canDelete,
}: TrainingEditorProps) {
  const [formData, setFormData] = React.useState<TrainingFormData>(initialData);
  const [pdict, setPdict] = React.useState<Record<number | string, ProblemDoc>>({});
  const [loading, setLoading] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [advancedJson, setAdvancedJson] = React.useState('');

  const descriptionContainerRef = React.useRef<HTMLDivElement>(null);
  const advancedContainerRef = React.useRef<HTMLDivElement>(null);
  const descriptionRef = React.useRef<HTMLTextAreaElement>(null);
  const advancedEditorRef = React.useRef<HTMLTextAreaElement>(null);
  const editorInitialized = React.useRef(false);
  const advancedEditorInitialized = React.useRef(false);

  React.useEffect(() => {
    const loadProblems = async () => {
      const allPids = formData.dag.flatMap((node) => node.pids).filter((p) => typeof p === 'number');
      if (allPids.length === 0) return;
      const uniquePids = [...new Set(allPids)];
      try {
        const pdocs = await api('problems', { ids: uniquePids }, ['docId', 'pid', 'title']);
        const newPdict: Record<number, ProblemDoc> = {};
        for (const pdoc of pdocs) {
          newPdict[pdoc.docId] = pdoc;
        }
        setPdict((prev) => ({ ...prev, ...newPdict }));
      } catch (e) {
        console.error('Failed to load problems:', e);
      }
    };
    loadProblems();
  }, []);

  React.useEffect(() => {
    if (descriptionContainerRef.current && !editorInitialized.current) {
      editorInitialized.current = true;
      const $ = (window as any).$;
      setTimeout(() => {
        $(descriptionContainerRef.current).trigger('vjContentNew');
      }, 0);
    }
  }, []);

  React.useEffect(() => {
    if (showAdvanced && advancedContainerRef.current && !advancedEditorInitialized.current) {
      advancedEditorInitialized.current = true;
      const $ = (window as any).$;
      setTimeout(() => {
        $(advancedContainerRef.current).trigger('vjContentNew');
      }, 0);
    }
  }, [showAdvanced]);

  const dagJsonRef = React.useRef(JSON.stringify(initialData.dag, null, 2));
  React.useEffect(() => {
    if (showAdvanced) {
      dagJsonRef.current = JSON.stringify(formData.dag, null, 2);
      setAdvancedJson(dagJsonRef.current);
    }
  }, [showAdvanced]);

  const updateFormField = <K extends keyof TrainingFormData>(field: K, value: TrainingFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleDescriptionChange = () => {
    if (descriptionRef.current) {
      updateFormField('description', descriptionRef.current.value);
    }
  };

  const addSection = () => {
    const newId = formData.dag.length > 0
      ? Math.max(...formData.dag.map((n) => n._id)) + 1
      : 1;
    const newNode: TrainingNode = {
      _id: newId,
      title: `${i18n('Section')} ${newId}`,
      requireNids: [],
      pids: [],
    };
    updateFormField('dag', [...formData.dag, newNode]);
  };

  const updateSection = (nodeId: number, updates: Partial<TrainingNode>) => {
    updateFormField('dag', formData.dag.map((node) =>
      node._id === nodeId ? { ...node, ...updates } : node,
    ));
  };

  const deleteSection = async (nodeId: number) => {
    const yes = await confirm(i18n('Are you sure you want to delete this section?'));
    if (!yes) return;
    updateFormField('dag', formData.dag.filter((node) => node._id !== nodeId));
  };

  const moveSection = (dragIndex: number, hoverIndex: number) => {
    const newDag = [...formData.dag];
    const [removed] = newDag.splice(dragIndex, 1);
    newDag.splice(hoverIndex, 0, removed);
    updateFormField('dag', newDag);
  };

  const moveProblemBetweenSections = (
    fromSectionId: number,
    toSectionId: number,
    fromIndex: number,
    toIndex: number,
  ) => {
    const newDag = formData.dag.map((node) => {
      if (node._id === fromSectionId) {
        const newPids = [...node.pids];
        const [pid] = newPids.splice(fromIndex, 1);
        if (node._id === toSectionId) {
          newPids.splice(toIndex, 0, pid);
        }
        return { ...node, pids: newPids };
      }
      if (node._id === toSectionId && fromSectionId !== toSectionId) {
        const fromNode = formData.dag.find((n) => n._id === fromSectionId);
        if (!fromNode) return node;
        const pid = fromNode.pids[fromIndex];
        const newPids = [...node.pids];
        newPids.splice(toIndex, 0, pid);
        return { ...node, pids: newPids };
      }
      return node;
    });
    updateFormField('dag', newDag);
  };

  const handlePdictUpdate = (pid: number | string, pdoc: ProblemDoc) => {
    setPdict((prev) => ({ ...prev, [pid]: pdoc }));
  };

  const handleApplyJson = () => {
    const jsonValue = advancedEditorRef.current?.value;
    if (!jsonValue) return;
    try {
      const parsed = JSON.parse(jsonValue);
      if (!Array.isArray(parsed)) {
        Notification.error(i18n('Invalid JSON format: must be an array'));
        return;
      }
      updateFormField('dag', parsed);
      Notification.success(i18n('JSON applied to editor'));
    } catch {
      Notification.error(i18n('Invalid JSON format'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (descriptionRef.current) {
      formData.description = descriptionRef.current.value;
    }
    if (formData.dag.length === 0) {
      Notification.error(i18n('Please add at least one section'));
      return;
    }
    const emptySection = formData.dag.find((node) => node.pids.length === 0);
    if (emptySection) {
      Notification.error(i18n('Each section must have at least one problem'));
      return;
    }
    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const yes = await confirm(i18n('Confirm deleting this training? Its files and status will be deleted as well.'));
    if (!yes) return;
    onDelete();
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <form onSubmit={handleSubmit}>
        <div className="section__header">
          <h2 className="section__title">{i18n('Basic Information')}</h2>
        </div>
        <div className="section__body">
          <div className="row">
            <div className="medium-9 columns form__item">
              <label>
                {i18n('Title')}
                <div className="textbox-container">
                  <input
                    type="text"
                    className="textbox"
                    name="title"
                    value={formData.title}
                    onChange={(e) => updateFormField('title', e.target.value)}
                    placeholder={i18n('title')}
                    required
                    autoFocus
                  />
                </div>
              </label>
            </div>
            <div className="medium-3 columns form__item end">
              <label>
                {i18n('Pin')}
                <div className="textbox-container">
                  <input
                    type="number"
                    className="textbox"
                    name="pin"
                    value={formData.pin}
                    onChange={(e) => updateFormField('pin', Number.parseInt(e.target.value, 10) || 0)}
                    placeholder={i18n('Pin level')}
                    min={0}
                  />
                </div>
              </label>
            </div>
          </div>
          <div className="row">
            <div className="columns form__item">
              <label>
                {i18n('Introduce')}
                <div className="textarea-container">
                  <textarea
                    className="textbox"
                    name="content"
                    value={formData.content}
                    onChange={(e) => updateFormField('content', e.target.value)}
                  />
                </div>
                <p className="help-text">{i18n('Introduce must not exceed 500 characters and it will be shown in the list view.')}</p>
              </label>
            </div>
          </div>
          <div className="row">
            <div className="columns form__item" ref={descriptionContainerRef}>
              <label>
                {i18n('Description')}
                <div className="textarea-container">
                  <textarea
                    ref={descriptionRef}
                    className="textbox"
                    name="description"
                    defaultValue={initialData.description}
                    onBlur={handleDescriptionChange}
                    style={{ height: '200px' }}
                    data-markdown
                  />
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="section__header" style={{ paddingTop: 0 }}>
          <h2 className="section__title">{i18n('Training Sections')}</h2>
          <div className="section__tools">
            <button
              type="button"
              className="rounded primary button"
              onClick={addSection}
            >
              <span className="icon icon-add" /> {i18n('Add Section')}
            </button>
          </div>
        </div>
        <div className="section__body">
          {formData.dag.length === 0 ? (
            <div className="training-empty-state" style={{ textAlign: 'center', padding: '2rem', background: '#f8f9fa', borderRadius: '4px', border: '2px dashed #ddd' }}>
              <p style={{ color: '#666', marginBottom: '1rem' }}>
                {i18n('No sections yet. Click the button above to add your first section.')}
              </p>
              <button
                type="button"
                className="rounded primary button"
                onClick={addSection}
              >
                <span className="icon icon-add" /> {i18n('Add First Section')}
              </button>
            </div>
          ) : (
            <div className="training-sections">
              {formData.dag.map((node, idx) => (
                <SectionItem
                  key={node._id}
                  node={node}
                  index={idx}
                  pdict={pdict}
                  onUpdate={updateSection}
                  onDelete={deleteSection}
                  onMove={moveSection}
                  onMoveProblem={moveProblemBetweenSections}
                  onPdictUpdate={handlePdictUpdate}
                />
              ))}
            </div>
          )}
        </div>

        <div className="section__header" style={{ paddingTop: 0 }}>
          <h2 className="section__title">{i18n('Advanced')}</h2>
          <div className="section__tools">
            <button
              type="button"
              className="link"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? i18n('Hide') : i18n('Show')} {i18n('JSON Editor')}
            </button>
          </div>
        </div>
        {showAdvanced && (
          <div className="section__body" ref={advancedContainerRef}>
            <div className="row">
              <div className="columns form__item">
                <label>
                  {i18n('Plan')}
                  <div className="textarea-container">
                    <textarea
                      ref={advancedEditorRef}
                      className="textbox"
                      defaultValue={advancedJson}
                      style={{ height: '400px' }}
                      data-json
                    />
                  </div>
                  <p className="help-text">{i18n('Edit JSON and click "Apply to Editor" to update the visual editor above. This does not save to server - use "Update" or "Create" button below to save.')}</p>
                </label>
                <button
                  type="button"
                  className="rounded button"
                  onClick={handleApplyJson}
                  style={{ marginTop: '8px' }}
                >
                  {i18n('Apply to Editor')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: '1.5rem' }}>
          <div className="columns">
            {isEdit ? (
              <button type="submit" className="rounded primary button" disabled={loading}>
                {loading ? i18n('Processing...') : i18n('Update')}
              </button>
            ) : (
              <button type="submit" className="rounded primary button" disabled={loading}>
                {loading ? i18n('Processing...') : i18n('Create')}
              </button>
            )}
            {isEdit && canDelete && (
              <button
                type="button"
                className="rounded button"
                onClick={handleDelete}
              >
                {i18n('Delete')}
              </button>
            )}
            <button
              type="button"
              className="rounded button"
              onClick={() => window.history.back()}
            >
              {i18n('Cancel')}
            </button>
          </div>
        </div>
      </form>
    </DndProvider>
  );
}
