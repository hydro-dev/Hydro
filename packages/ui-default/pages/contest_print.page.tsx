import $ from 'jquery';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfirmDialog } from 'vj/components/dialog';
import highlighter from 'vj/components/highlighter/prismjs';
import { NamedPage } from 'vj/misc/Page';
import { delay, i18n, mongoId, request, tpl } from 'vj/utils';

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

function inlineStyles(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  element.style.color = style.color;
  element.style.backgroundColor = style.backgroundColor;
  element.style.fontWeight = style.fontWeight;
  element.style.fontStyle = style.fontStyle;
  element.style.textDecoration = style.textDecoration;
  element.style.fontFamily = style.fontFamily;
  element.style.fontSize = style.fontSize;
  element.style.lineHeight = style.lineHeight;
  element.style.whiteSpace = style.whiteSpace;
  element.style.wordSpacing = style.wordSpacing;
  element.style.wordBreak = style.wordBreak;
  element.style.tabSize = style.tabSize;
  element.style.hyphens = style.hyphens;
  Array.from(element.children).forEach((child) => inlineStyles(child as HTMLElement));
}

// eslint-disable-next-line react-refresh/only-export-components
const PrintKiosk = ({ isAdmin }: { isAdmin: boolean }) => {
  const [printTasks, setPrintTasks] = useState<PrintTask[]>([]);
  const [isKioskActive, setIsKioskActive] = useState(false);
  const [udict, setUdict] = useState<Record<number, any>>({});

  const pollPrintTasks = async () => {
    const response = await callApi('getPrintTask');
    setPrintTasks(response.tasks || []);
    setUdict(response.udict || {});
  };

  const printTask = async (task, udoc) => {
    const printWindow = window.open('', '_blank', 'width=800,height=600,popup=1');
    if (!printWindow) return;

    // Limit line count to prevent printing too many pages
    const finalContent = [];
    let cnt = 0;
    for (const line of task.content.split('\n')) {
      cnt += Math.ceil(line.length / 100);
      if (cnt > 300) break;
      finalContent.push(line);
    }

    const parts = task.title.split('.');
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'plaintext';
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    const pre = document.createElement('pre');
    pre.className = 'content';
    const code = document.createElement('code');
    code.className = `language-${ext}`;
    code.textContent = finalContent.join('\n');
    pre.appendChild(code);
    tempDiv.appendChild(pre);
    document.body.appendChild(tempDiv);
    highlighter.highlightBlocks($(tempDiv));
    inlineStyles(pre);
    const highlightedContent = pre.outerHTML;
    document.body.removeChild(tempDiv);

    const header = tpl(<div className="header">
      <p>
        [{udoc.uname}] {udoc.school || ''} {udoc.displayName || ''} &nbsp;
        <span style={{ float: 'right' }}>{new Date(mongoId(task._id).timestamp * 1000).toLocaleString()}</span>
        <br />
        Filename: {task.title}
        <span style={{ float: 'right' }}>By Hydro</span>
      </p>
    </div>);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Page</title>
        <style>
          body { font-family: monospace; margin: 10px; font-size: 14px; line-height: 1.2; }
          .header { border-bottom: 1px solid #ccc; }
          pre { margin: 0; margin-block: 0; white-space: pre-wrap !important; }
        </style>
      </head>
      <body>
        ${header}
        ${highlightedContent}
      </body>
      </html>
    `);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
      // printWindow.close();
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
            await printTask(task.task, task.udoc);
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
  }, []);

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
  element.onchange = async (ev: Event) => {
    const file = (ev.target as HTMLInputElement).files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('operation', 'print');
    const language = file.name.split('.').pop()?.toLowerCase();
    const dialog = new ConfirmDialog({
      $body: tpl(<div className="typo">
        <h3>{i18n('Are you sure to print this file?')}<span style={{ float: 'right' }}>{i18n('Filename: {0}', file.name)}</span></h3>
        <div style={{ maxHeight: '60vh', overflow: 'scroll' }}>
          <pre><code className={`language-${language}`}>{await file.text()}</code></pre>
        </div>
      </div>),
    });
    const action = await dialog.open();
    if (action !== 'yes') return;
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
