import $ from 'jquery';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { NamedPage } from 'vj/misc/Page';
import { delay, mongoId, request, tpl } from 'vj/utils';

interface PrintTask {
  _id: string;
  owner: number;
  title: string;
  createAt: string;
  uid: number;
  content: string;
  status: string;
}

const apis = {
  getPrintTask: () => request.post('', { operation: 'get_print_task' }),
  updatePrintTask: (taskId: string, status: string) => request.post('', { operation: 'update_print_task', taskId, status }),
  allocatePrintTask: () => request.post('', { operation: 'allocate_print_task' }),
} as const;

const callApi = async <T extends keyof typeof apis>(api: T, ...args: Parameters<typeof apis[T]> & any[]) => {
  try {
    return (await apis[api].call(apis[api], ...args)) as Awaited<ReturnType<typeof apis[T]>>;
  } catch (error) {
    console.error(`Failed to call API ${api}:`, error);
    return null;
  }
};

const PrintKiosk = ({ isAdmin }: { isAdmin: boolean }) => {
  const [printTasks, setPrintTasks] = useState<PrintTask[]>([]);
  const [isKioskActive, setIsKioskActive] = useState(false);
  const [udict, setUdict] = useState<Record<number, any>>({});

  const pollPrintTasks = async () => {
    const response = await callApi('getPrintTask');
    setPrintTasks(response.tasks || []);
    setUdict(response.udict || {});
  };

  const printTask = async (task) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Page</title>
        <style>
          body { font-family: monospace; white-space: pre-wrap; margin: 10px; }
          .header { border-bottom: 1px solid #ccc; padding-bottom: 10px; }
          .content { font-size: 12px; line-height: 1.2; }
        </style>
      </head>
      <body>
      ${tpl(<>
      <div className="header">
        <h2>{task.title}</h2>
        <p>
          <strong>User:</strong> {task.owner} &nbsp;
          <strong>Time:</strong> {new Date(mongoId(task._id).timestamp * 1000).toLocaleString()}
        </p>
      </div>
      <pre className="content"><code>{task.content}</code></pre>
    </>)}
    </body >
      </html >
  `);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      callApi('updatePrintTask', task._id, 'printed').then(() => pollPrintTasks());
    }, 500);
  };

  useEffect(() => {
    pollPrintTasks();
    let active = true;
    if (isKioskActive) {
      (async () => {
        while (active) { // eslint-disable-line no-unmodified-loop-condition
          const task = await callApi('allocatePrintTask');
          if (!task?.task) await delay(5000);
          else {
            await printTask(task.task);
            await pollPrintTasks();
          }
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [isKioskActive]);

  useEffect(() => {
    const cb = () => setIsKioskActive(true);
    $(document).on('click', '[name="enable_print_kiosk"]', cb);
    return () => {
      $(document).off('click', '[name="enable_print_kiosk"]', cb);
    };
  });

  return <div className="print-kiosk">
    {isKioskActive && <p style={{ textAlign: 'center' }}>Print Kiosk is enabled</p>}

    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Title</th>
            <th>Time</th>
            <th>Status</th>
            {isAdmin && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {printTasks.length === 0
            && <tr><td colSpan={isAdmin ? 5 : 4}><p style={{ textAlign: 'center' }}>No pending print tasks.</p></td></tr>}
          {printTasks.map((task) => (
            <tr key={task._id}>
              <td><a href={`/user/${task.owner}`}>{udict[task.owner]?.uname}</a></td>
              <td>{task.title}</td>
              <td>{new Date(mongoId(task._id).timestamp * 1000).toLocaleString()}</td>
              <td>{task.status}</td>
              {isAdmin && <td>
                <button
                  onClick={() => callApi('updatePrintTask', task._id, 'pending').then(() => pollPrintTasks())}
                  className="typo-a"
                >
                  Re-Print
                </button>
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
};

const page = new NamedPage('contest_print', () => {
  const element = document.createElement('input');
  element.type = 'file';
  element.name = 'file';
  element.style.display = 'none';
  document.body.appendChild(element);
  element.onchange = (ev: Event) => {
    const file = (ev.target as HTMLInputElement).files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('operation', 'print');
    request.postFile('', formData).then(() => {
      window.location.reload();
    });
  };
  $(document).on('click', '[name="add_print_task"]', () => {
    element.click();
  });
  const container = document.getElementById('printKioskContainer');
  if (!container) return;
  const root = ReactDOM.createRoot(container);
  root.render(<PrintKiosk isAdmin={!!container.dataset.isAdmin} />);
});

export default page;
