import { createRoot } from 'react-dom/client';
import { TrainingEditor } from 'vj/components/training';
import type { TrainingFormData, TrainingNode } from 'vj/components/training/types';
import { NamedPage } from 'vj/misc/Page';

import './training_edit.page.styl';

declare const UiContext: {
  tdoc?: {
    title: string;
    content: string;
    description: string;
    pin: number;
  };
};

function parseDag(dagStr: string | undefined, defaultDag: TrainingNode[]): TrainingNode[] {
  if (!dagStr) return defaultDag;
  try {
    return JSON.parse(dagStr);
  } catch {
    return defaultDag;
  }
}

const page = new NamedPage(['training_edit', 'training_create'], () => {
  const container = document.getElementById('TrainingEditor');
  const form = document.getElementById('TrainingForm') as HTMLFormElement | null;
  if (!container || !form) return;

  const isEdit = window.location.pathname.includes('/edit');

  const defaultDagEl = document.getElementById('defaultDag') as HTMLTextAreaElement | null;
  const dagEl = form.querySelector('textarea[name="dag"]') as HTMLTextAreaElement | null;
  const defaultDag = parseDag(defaultDagEl?.value, []);
  const dag = parseDag(dagEl?.value, defaultDag);

  const initialData: TrainingFormData = {
    title: UiContext.tdoc?.title || '',
    content: UiContext.tdoc?.content || '',
    description: UiContext.tdoc?.description || '',
    pin: UiContext.tdoc?.pin || 0,
    dag: isEdit ? dag : (dag.length > 0 ? dag : defaultDag),
  };

  createRoot(container).render(
    <TrainingEditor initialData={initialData} />,
  );
});

export default page;
