import { createRoot } from 'react-dom/client';
import Notification from 'vj/components/notification';
import { TrainingEditor } from 'vj/components/training';
import type { TrainingFormData, TrainingNode } from 'vj/components/training/types';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request } from 'vj/utils';

declare const UiContext: {
  tdoc?: {
    title: string;
    content: string;
    description: string;
    pin: number;
  };
  dag: TrainingNode[] | string;
  defaultDag: TrainingNode[];
  canDelete: boolean;
};

function parseDag(dag: TrainingNode[] | string | undefined, defaultDag: TrainingNode[]): TrainingNode[] {
  if (!dag) return defaultDag;
  if (typeof dag === 'string') {
    try {
      return JSON.parse(dag);
    } catch {
      return defaultDag;
    }
  }
  return dag;
}

const page = new NamedPage(['training_edit', 'training_create'], () => {
  const container = document.getElementById('TrainingEditor');
  const fallbackForm = document.getElementById('TrainingForm');
  if (!container) return;

  if (fallbackForm) fallbackForm.style.display = 'none';

  const isEdit = window.location.pathname.includes('/edit');
  const defaultDag = UiContext.defaultDag || [];
  const dag = parseDag(UiContext.dag, defaultDag);

  const initialData: TrainingFormData = {
    title: UiContext.tdoc?.title || '',
    content: UiContext.tdoc?.content || '',
    description: UiContext.tdoc?.description || '',
    pin: UiContext.tdoc?.pin || 0,
    dag: isEdit ? dag : (dag.length > 0 ? dag : defaultDag),
  };

  const handleSubmit = async (data: TrainingFormData) => {
    try {
      const payload = {
        title: data.title,
        content: data.content,
        description: data.description,
        pin: data.pin,
        dag: JSON.stringify(data.dag),
      };
      const res = await request.post('', payload);
      Notification.success(i18n(isEdit ? 'Training updated successfully' : 'Training created successfully'));
      if (res.url) {
        window.location.href = res.url;
      } else if (res.tid) {
        window.location.href = `./training/${res.tid}`;
      }
    } catch (error: any) {
      Notification.error(error.message || i18n('Failed to save training'));
      throw error;
    }
  };

  const handleDelete = async () => {
    try {
      const path = window.location.pathname;
      const tidMatch = path.match(/\/training\/([^/]+)\/edit/);
      if (!tidMatch) throw new Error('Training ID not found');
      const tid = tidMatch[1];
      const baseUrl = path.replace(/\/training\/[^/]+\/edit.*$/, '');
      const res = await request.post(`${baseUrl}/training/${tid}`, { operation: 'delete' });
      Notification.success(i18n('Training deleted successfully'));
      window.location.href = res.url || `${baseUrl}/training`;
    } catch (error: any) {
      Notification.error(error.message || i18n('Failed to delete training'));
    }
  };

  createRoot(container).render(
    <TrainingEditor
      initialData={initialData}
      isEdit={isEdit}
      onSubmit={handleSubmit}
      onDelete={isEdit ? handleDelete : undefined}
      canDelete={UiContext.canDelete}
    />,
  );
});

export default page;
