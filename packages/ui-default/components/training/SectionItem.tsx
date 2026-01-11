import { AutoCompleteHandle } from '@hydrooj/components';
import type { ProblemDoc } from 'hydrooj/src/interface';
import React from 'react';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/components/ProblemSelectAutoComplete';
import Notification from 'vj/components/notification';
import { i18n } from 'vj/utils';
import { TrainingNode, wouldCreateCycle } from './types';

const PREREQ_COLLAPSE_THRESHOLD = 10;

interface SectionItemProps {
  node: TrainingNode;
  index: number;
  totalSections: number;
  allSections: TrainingNode[];
  defaultCollapsed?: boolean;
  onUpdate: (nodeId: number, updates: Partial<TrainingNode>) => void;
  onDelete: (nodeId: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SectionItem({
  node, index, totalSections, allSections, defaultCollapsed = false, onUpdate, onDelete, onMoveUp, onMoveDown,
}: SectionItemProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [titleValue, setTitleValue] = React.useState(node.title);
  const [prereqExpanded, setPrereqExpanded] = React.useState(false);
  const autocompleteRef = React.useRef<AutoCompleteHandle<ProblemDoc>>(null);

  const handlePidsChange = React.useCallback((val: string) => {
    const pids = val.split(',').map((v) => v.trim()).filter((v) => v).map((v) => {
      const num = Number.parseInt(v, 10);
      return Number.isNaN(num) ? v : num;
    });
    onUpdate(node._id, { pids });
  }, [node._id, onUpdate]);

  // Sync title value when node.title changes externally
  React.useEffect(() => {
    if (!isEditingTitle) setTitleValue(node.title);
  }, [node.title, isEditingTitle]);

  const handleTitleSave = React.useCallback(() => {
    if (titleValue.trim()) {
      onUpdate(node._id, { title: titleValue.trim() });
    } else {
      setTitleValue(node.title);
    }
    setIsEditingTitle(false);
  }, [titleValue, node._id, node.title, onUpdate]);

  const handleTitleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') {
      setTitleValue(node.title);
      setIsEditingTitle(false);
    }
  }, [handleTitleSave, node.title]);

  const handleRequireNidsChange = React.useCallback((sectionId: number, checked: boolean) => {
    if (checked && wouldCreateCycle(allSections, node._id, sectionId)) {
      Notification.error(i18n('Cannot add this prerequisite: it would create a circular dependency'));
      return;
    }
    const newRequireNids = checked
      ? [...node.requireNids, sectionId]
      : node.requireNids.filter((id) => id !== sectionId);
    onUpdate(node._id, { requireNids: newRequireNids });
  }, [allSections, node._id, node.requireNids, onUpdate]);

  const handleToggleCollapse = React.useCallback(() => setIsCollapsed((c) => !c), []);
  const handleStartEditTitle = React.useCallback(() => setIsEditingTitle(true), []);
  const handleDeleteClick = React.useCallback(() => onDelete(node._id), [onDelete, node._id]);

  // Memoize section index lookup for prereqs
  const sectionIndexMap = React.useMemo(() => {
    const map = new Map<number, number>();
    allSections.forEach((s, i) => map.set(s._id, i));
    return map;
  }, [allSections]);

  const availablePrereqs = React.useMemo(
    () => allSections.filter((s) => s._id !== node._id),
    [allSections, node._id],
  );

  return (
    <div className="training-section" style={{ border: '1px solid #ddd', borderRadius: '4px', marginBottom: '12px', background: '#fff' }}>
      <div
        className="training-section__header"
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: isCollapsed ? 'none' : '1px solid #eee',
          background: '#fafafa', borderRadius: isCollapsed ? '4px' : '4px 4px 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              type="button"
              className="link"
              onClick={onMoveUp}
              disabled={index === 0}
              style={{ padding: '0 4px', opacity: index === 0 ? 0.3 : 1 }}
            >
              <span className="icon icon-expand_less" style={{ fontSize: '14px' }} />
            </button>
            <button
              type="button"
              className="link"
              onClick={onMoveDown}
              disabled={index === totalSections - 1}
              style={{ padding: '0 4px', opacity: index === totalSections - 1 ? 0.3 : 1 }}
            >
              <span className="icon icon-expand_more" style={{ fontSize: '14px' }} />
            </button>
          </div>
          <span className="user-profile-badge badge--lv5">
            {i18n('Section')} {index + 1}
          </span>
          {isEditingTitle ? (
            <input
              type="text"
              className="textbox"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              style={{ width: '300px' }}
            />
          ) : (
            <span
              style={{ fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={handleStartEditTitle}
            >
              {node.title || i18n('Untitled Section')}
              <span className="icon icon-edit" style={{ fontSize: '14px', opacity: 0.6 }} />
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" className="link" onClick={handleToggleCollapse}>
            <span className={isCollapsed ? 'icon icon-expand_more' : 'icon icon-expand_less'} />
          </button>
          <button type="button" className="link" onClick={handleDeleteClick} style={{ color: '#e74c3c' }}>
            <span className="icon icon-delete" />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="training-section__body" style={{ padding: '16px' }}>
          {availablePrereqs.length > 0 && (
            <div className="row"><div className="columns form__item">
              <label>{i18n('Prerequisite Sections')}</label>
              {(() => {
                const selectedPrereqs = availablePrereqs.filter((s) => node.requireNids.includes(s._id));
                const needsCollapse = availablePrereqs.length > PREREQ_COLLAPSE_THRESHOLD;
                const prereqsToShow = needsCollapse && !prereqExpanded ? selectedPrereqs : availablePrereqs;
                return (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
                      {prereqsToShow.map((s) => {
                        const isChecked = node.requireNids.includes(s._id);
                        const sectionNum = (sectionIndexMap.get(s._id) ?? 0) + 1;
                        return (
                          <label key={s._id} className="checkbox" style={{ flexDirection: 'row-reverse', gap: '4px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleRequireNidsChange(s._id, e.target.checked)}
                            />
                            {s.title || `${i18n('Section')} ${sectionNum}`}
                          </label>
                        );
                      })}
                    </div>
                    {needsCollapse && (
                      <button
                        type="button"
                        className="link"
                        onClick={() => setPrereqExpanded((v) => !v)}
                        style={{ marginTop: '8px', fontSize: '12px' }}
                      >
                        {prereqExpanded
                          ? i18n('Show less')
                          : i18n('Show all {0} sections', [availablePrereqs.length])}
                      </button>
                    )}
                  </>
                );
              })()}
            </div></div>
          )}
          <div className="row"><div className="columns form__item">
            <label>
              {i18n('Problems')}
              <ProblemSelectAutoComplete
                ref={autocompleteRef}
                multi
                selectedKeys={node.pids.map(String)}
                onChange={handlePidsChange}
              />
            </label>
          </div></div>
        </div>
      )}
    </div>
  );
}

export default React.memo(SectionItem);
