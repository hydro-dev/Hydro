import { AutoCompleteHandle } from '@hydrooj/components';
import type { ProblemDoc } from 'hydrooj/src/interface';
import React from 'react';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/components/ProblemSelectAutoComplete';
import Notification from 'vj/components/notification';
import { api, i18n } from 'vj/utils';

interface ProblemSelectorProps {
  onSelect: (pid: number | string, pdoc?: ProblemDoc) => void;
  existingPids: (number | string)[];
}

export default function ProblemSelector({ onSelect, existingPids }: ProblemSelectorProps) {
  const ref = React.useRef<AutoCompleteHandle<ProblemDoc>>(null);
  const processingRef = React.useRef(false);

  const handleChange = async (value: string) => {
    if (processingRef.current) return;
    if (!value.trim()) return;

    const keys = value.split(',').filter((v) => v.trim());
    if (keys.length === 0) return;

    processingRef.current = true;
    try {
      for (const key of keys) {
        const pid = Number.parseInt(key, 10);
        if (Number.isNaN(pid)) continue;
        if (existingPids.includes(pid)) {
          Notification.warn(i18n('Problem already added'));
          continue;
        }
        try {
          const pdocs = await api('problems', { ids: [pid] }, ['docId', 'pid', 'title']);
          if (pdocs.length === 0) {
            Notification.error(i18n('Problem {0} not found').replace('{0}', String(pid)));
            continue;
          }
          onSelect(pid, pdocs[0]);
        } catch {
          Notification.error(i18n('Problem {0} not found').replace('{0}', String(pid)));
        }
      }
    } finally {
      processingRef.current = false;
      ref.current?.clear();
    }
  };

  return (
    <div>
      <label style={{ fontWeight: 500, fontSize: '14px', display: 'block', marginBottom: '8px' }}>
        {i18n('Add Problem')}
      </label>
      <ProblemSelectAutoComplete
        ref={ref}
        multi
        onChange={handleChange}
        selectedKeys={[]}
        freeSolo
        freeSoloConverter={(input) => input}
        height="34px"
      />
    </div>
  );
}
