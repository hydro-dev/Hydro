(() => {
  'use strict';
  const root = document.getElementById('arena-participants');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  const api = root.dataset.api, csrf = root.dataset.csrf;
  const addDialog = root.querySelector('[data-add-dialog]'), confirmDialog = root.querySelector('[data-confirm-dialog]');
  const resultDialog = root.querySelector('[data-result-dialog]'), query = root.querySelector('[data-user-query]');
  const chosen = new Map();
  let busy = false, searchTimer, searchRequest, confirmation, importResult, importToken = '';
  const noticeKey = `hgnu-participants:${location.pathname}`;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const showError = (error, target = root.querySelector('[data-error]')) => {
    target.textContent = error.message || String(error); target.hidden = false;
  };
  function selection() {
    return [...root.querySelectorAll('[data-participant-check]:checked')].map(e => +e.value);
  }
  function updateSelection() {
    root.querySelector('[data-selection-count]').textContent = `已选择 ${selection().length} 项`;
    root.querySelectorAll('[data-bulk-action]').forEach(button => { button.disabled = busy || !selection().length; });
    const visible = [...root.querySelectorAll('[data-participant-row]')].filter(row => !row.hidden);
    const checked = visible.filter(row => row.querySelector('[data-participant-check]').checked).length;
    const all = root.querySelector('[data-select-all]');
    all.checked = !!visible.length && checked === visible.length;
    all.indeterminate = checked > 0 && checked < visible.length;
  }
  async function request(action, body = {}) {
    const form = body instanceof FormData;
    if (form) { body.set('action', action); body.set('csrf', csrf); }
    const response = await fetch(api, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', ...(!form ? { 'Content-Type': 'application/json' } : {}) }, body: form ? body : JSON.stringify({ ...body, action, csrf }) });
    let data; try { data = await response.json(); } catch { throw new Error('服务器未返回处理结果，请先刷新列表确认状态再重试。'); }
    if (!response.ok || data.error) throw new Error([data.error?.message || data.message || '操作失败', ...(data.error?.params || [])].join(' '));
    return data;
  }
  async function working(callback, target) {
    if (busy) return;
    busy = true; root.querySelector('[data-error]').hidden = true;
    if (target) target.hidden = true;
    const disabled = new Set([...root.querySelectorAll('button')].filter(button => button.disabled));
    root.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await callback(); } catch (error) { showError(error, target); }
    finally { busy = false; root.querySelectorAll('button').forEach(button => { button.disabled = disabled.has(button); }); updateSelection(); updateImportSelection(); }
  }
  function reload(message) {
    try { sessionStorage.setItem(noticeKey, message); } catch {}
    location.reload();
  }
  function summary(data) {
    if (data.changed) return `已处理 ${data.changed.length} 项，失败 ${data.failed?.length || 0} 项。`;
    return `新增报名 ${data.added?.length || 0} 项，已报名 ${data.existing?.length || 0} 项，失败 ${data.failed?.length || 0} 项。`
      + (data.rows !== undefined ? ` 未匹配 ${(data.unmatched || []).reduce((sum, item) => sum + (item.lines?.length || 1), 0)} 行，格式问题 ${data.issues?.length || 0} 行，待确认重名 ${data.duplicates?.length || 0} 组。` : '');
  }
  function issues(container, data) {
    const list = node('ul', undefined, 'participant-import-issues');
    function issue(title, reason) { const item = node('li'); item.append(node('strong', title), node('span', reason)); list.append(item); }
    for (const item of data.unmatched || []) issue(`第 ${item.lines?.join('、') || item.line} 行 · ${item.className} · ${item.name}`, item.reason);
    for (const item of data.issues || []) issue(`第 ${item.line} 行`, item.reason);
    for (const item of data.failed || []) issue(`UID ${item.uid}`, item.reason);
    container.replaceChildren();
    if (list.children.length) {
      const details = node('details', undefined, 'participant-result-issues'); details.open = !data.duplicates?.length;
      const label = node('summary'); label.append(node('strong', `${list.children.length} 条未导入记录`), node('span', '查看详情'));
      details.append(label, list); container.append(details);
    }
  }
  function resultSummary(data) {
    const container = root.querySelector('[data-import-summary]'); container.replaceChildren();
    const stats = node('div', undefined, 'participant-result-stats');
    const unmatched = (data.unmatched || []).reduce((sum, item) => sum + (item.lines?.length || 1), 0);
    const values = data.changed ? [['已处理', data.changed.length, '项', 'success']]
      : [['已新增', data.added?.length || 0, '人', 'success'], ['已报名', data.existing?.length || 0, '人', 'neutral']];
    values.push(['待确认重名', data.duplicates?.length || 0, '组', 'pending'], ['未匹配', unmatched, '人', 'warning'], ['格式问题', data.issues?.length || 0, '行', 'warning'], ['处理失败', data.failed?.length || 0, '项', 'warning']);
    for (const [label, value, unit, tone] of values) {
      if (!value) continue;
      const card = node('div', undefined, `participant-result-stat ${tone}`), count = node('div', undefined, 'participant-result-count');
      count.append(node('strong', String(value)), node('span', unit)); card.append(count, node('span', label)); stats.append(card);
    }
    if (!stats.children.length) container.append(node('p', '没有新增报名，请检查表格中是否填写了人员信息。', 'participant-result-intro'));
    else container.append(stats);
    if (data.repeatedRows) container.append(node('p', `表格中的 ${data.repeatedRows} 条重复记录已合并处理。`, 'participant-result-note'));
  }
  function updateImportSelection() {
    const count = root.querySelectorAll('[data-duplicate-key] input:checked').length, button = root.querySelector('[data-resolve-import]');
    button.hidden = !importToken; button.disabled = busy || !count;
    button.textContent = count ? `导入所选账号（${count}）` : '导入所选账号';
    const finish = root.querySelector('[data-finish-result-label]');
    finish.textContent = importToken ? '跳过重名并完成' : '完成'; finish.classList.toggle('primary', !importToken);
  }
  function showResult(data) {
    importResult = data; importToken = data.token || '';
    root.querySelector('#participant-result-title').textContent = data.rows !== undefined ? '导入结果' : '处理结果';
    resultSummary(data);
    issues(root.querySelector('[data-import-issues]'), data);
    const groups = root.querySelector('[data-duplicate-groups]'); groups.replaceChildren();
    if (data.duplicates?.length) {
      const reviewHead = node('div', undefined, 'participant-review-head');
      reviewHead.append(node('h3', '选择重名账号', 'participant-review-heading'), node('p', '可多选，未选择的账号不会导入。', 'participant-review-hint')); groups.append(reviewHead);
      for (const group of data.duplicates) {
        const box = node('section', undefined, 'participant-duplicate'); box.dataset.duplicateKey = group.key;
        const head = node('div', undefined, 'participant-duplicate-head'), identity = node('div', undefined, 'participant-duplicate-identity');
        identity.append(node('strong', group.name), node('span', group.className)); head.append(identity, node('small', `第 ${group.lines.join('、')} 行`)); box.append(head);
        const buttons = node('div', undefined, 'participant-duplicate-tools');
        for (const [label, checked] of [['全选本组', true], ['清空本组', false]]) {
          const button = node('button', label, 'participant-link-button'); button.type = 'button';
          button.addEventListener('click', () => { box.querySelectorAll('input').forEach(input => { input.checked = checked; }); updateImportSelection(); }); buttons.append(button);
        }
        box.append(buttons);
        for (const candidate of group.candidates) {
          const label = node('label', undefined, 'participant-candidate'), input = node('input'), text = node('span', undefined, 'participant-candidate-text');
          input.type = 'checkbox'; input.value = candidate.uid; input.setAttribute('aria-label', `${candidate.name}，${candidate.className}，${candidate.uname}，UID ${candidate.uid}`);
          input.addEventListener('change', updateImportSelection);
          text.append(node('strong', candidate.uname), node('small', `UID ${candidate.uid}`)); label.append(input, text); box.append(label);
        }
        groups.append(box);
      }
    }
    updateImportSelection();
    root.querySelector('[data-result-error]').hidden = true;
    if (!resultDialog.open) resultDialog.showModal();
  }
  function drawChosen() {
    const container = root.querySelector('[data-chosen-users]'); container.replaceChildren();
    for (const item of chosen.values()) {
      const button = node('button', `${item.className} · ${item.name} (${item.uname}) ×`); button.type = 'button';
      button.addEventListener('click', () => { chosen.delete(item.uid); drawChosen(); }); container.append(button);
    }
  }
  async function search() {
    const text = query.value.trim(), results = root.querySelector('[data-user-results]');
    searchRequest?.abort();
    if (!text) { results.replaceChildren(); results.hidden = true; return; }
    searchRequest = new AbortController(); results.hidden = false; results.textContent = '正在搜索…';
    try {
      const url = new URL(api, location.origin); url.searchParams.set('q', text);
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: searchRequest.signal });
      const data = await response.json(); if (!response.ok || !Array.isArray(data.users)) throw new Error('搜索失败，请重试');
      if (query.value.trim() !== text) return;
      results.replaceChildren();
      for (const item of data.users) {
        const button = node('button'); button.type = 'button';
        button.append(node('strong', `${item.name} · ${item.className}`), node('small', `${item.uname} · UID ${item.uid}${item.enrolled ? ' · 已报名' : ''}`));
        button.disabled = item.enrolled;
        button.addEventListener('click', () => { chosen.set(item.uid, item); drawChosen(); }); results.append(button);
      }
      if (!data.users.length) results.textContent = '没有匹配的用户。';
    } catch (error) { if (error.name !== 'AbortError') results.textContent = error.message; }
  }
  query.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 250); });
  root.querySelector('[data-add-users]').addEventListener('click', () => {
    chosen.clear(); drawChosen(); query.value = ''; root.querySelector('[data-unrank]').checked = false;
    root.querySelector('[data-add-error]').hidden = true;
    searchRequest?.abort(); clearTimeout(searchTimer);
    const results = root.querySelector('[data-user-results]'); results.replaceChildren(); results.hidden = true;
    addDialog.showModal(); query.focus();
  });
  root.querySelector('[data-submit-add]').addEventListener('click', () => working(async () => {
    if (!chosen.size) throw new Error('请先选择用户');
    const data = await request('add', { uids: [...chosen.keys()], unrank: root.querySelector('[data-unrank]').checked }); addDialog.close();
    if (data.failed?.length) showResult(data); else reload(summary(data));
  }, root.querySelector('[data-add-error]')));
  root.querySelector('[data-import-users]').addEventListener('click', () => root.querySelector('[data-roster-file]').click());
  root.querySelector('[data-roster-file]').addEventListener('change', event => working(async () => {
    const file = event.target.files[0]; if (!file) return;
    const body = new FormData(); body.set('file', file); showResult(await request('import', body)); event.target.value = '';
  }));
  root.querySelector('[data-resolve-import]').addEventListener('click', () => working(async () => {
    const choices = {};
    root.querySelectorAll('[data-duplicate-key]').forEach(group => { choices[group.dataset.duplicateKey] = [...group.querySelectorAll('input:checked')].map(input => +input.value); });
    const data = await request('resolve', { token: importToken, choices });
    showResult({ ...importResult, added: [...(importResult.added || []), ...(data.added || [])], existing: [...(importResult.existing || []), ...(data.existing || [])], failed: [...(importResult.failed || []), ...(data.failed || [])], duplicates: [], token: '' });
  }, root.querySelector('[data-result-error]')));
  root.querySelectorAll('[data-finish-result]').forEach(button => button.addEventListener('click', () => { if (!busy) reload('参赛者列表已更新。'); }));
  resultDialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) reload('参赛者列表已更新。'); });
  root.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => { if (!busy) button.closest('dialog').close(); }));
  root.querySelector('[data-roster-filter]').addEventListener('input', event => {
    const term = event.target.value.trim().toLocaleLowerCase();
    root.querySelectorAll('[data-participant-row]').forEach(row => { row.hidden = !row.dataset.search.toLocaleLowerCase().includes(term); }); updateSelection();
  });
  root.querySelector('[data-select-all]').addEventListener('change', event => {
    root.querySelectorAll('[data-participant-row]').forEach(row => { if (!row.hidden) row.querySelector('[data-participant-check]').checked = event.target.checked; }); updateSelection();
  });
  root.querySelectorAll('[data-participant-check]').forEach(input => input.addEventListener('change', updateSelection));
  function confirmAction(action, uids) {
    if (!uids.length) return;
    const descriptions = { cancel: `取消选中 ${uids.length} 项报名？已有评测记录保留。`, release: `解除选中 ${uids.length} 项的参赛模式？报名和成绩保留，账号可正常访问 OJ。`, enable: `开启选中 ${uids.length} 项的参赛模式？开赛前 20 分钟开始限制访问，比赛结束时自动解除。` };
    if (!descriptions[action]) { execute(action, uids); return; }
    confirmation = { action, uids }; root.querySelector('[data-confirm-text]').textContent = descriptions[action]; confirmDialog.showModal();
  }
  async function execute(action, uids) {
    await working(async () => {
      const data = await request(action, { uids });
      if (data.failed?.length) showResult(data);
      else reload(`已处理 ${data.changed?.length || 0} 项。${action === 'cancel' ? '评测记录已保留。' : ''}`);
    });
  }
  root.querySelector('[data-confirm-submit]').addEventListener('click', () => { const item = confirmation; confirmDialog.close(); if (item) execute(item.action, item.uids); });
  root.querySelectorAll('[data-row-action]').forEach(button => button.addEventListener('click', () => confirmAction(button.dataset.rowAction, [+button.dataset.uid])));
  root.querySelectorAll('[data-bulk-action]').forEach(button => button.addEventListener('click', () => confirmAction(button.dataset.bulkAction, selection())));
  try { const message = sessionStorage.getItem(noticeKey); if (message) { const notice = root.querySelector('[data-notice]'); notice.textContent = message; notice.hidden = false; sessionStorage.removeItem(noticeKey); } } catch {}
  updateSelection();
})();
