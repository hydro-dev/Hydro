(() => {
    'use strict';
    const root = document.getElementById('balloon-manager');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = 'true';
    const find = (selector) => root.querySelector(selector);
    const all = (selector) => [...root.querySelectorAll(selector)];
    const palette = JSON.parse(root.dataset.palette);
    let problems = JSON.parse(root.dataset.problems);
    let rows = JSON.parse(root.dataset.initial);
    let enabled = root.dataset.enabled === 'true';
    let pushEnabled = root.dataset.pushEnabled === 'true';
    let status = 'pending';
    let page = 1;
    let busy = false;
    let polling = false;
    const selected = new Set();
    const configDialog = find('[data-balloon-config-dialog]');
    const confirmDialog = find('[data-balloon-confirm]');
    const notice = find('[data-balloon-notice]');
    const errorBox = find('[data-balloon-error]');
    const configError = find('[data-balloon-config-error]');
    let draft = [];
    let resolveConfirmation;
    const element = (tag, className = '', text = '') => {
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = text;
        return node;
    };
    const contrast = (color) => {
        const values =
            color
                .slice(1)
                .match(/../g)
                ?.map((v) => Number.parseInt(v, 16)) || [];
        return (values[0] * 299 + values[1] * 587 + values[2] * 114) / 1000 >= 128 ? '#000000' : '#ffffff';
    };
    const badge = (p) => {
        const el = element('span', 'balloon-color-badge', p.label);
        el.style.backgroundColor = p.color;
        el.style.color = p.textColor || contrast(p.color);
        return el;
    };
    const time = (value) => (value ? new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—');
    function showMessage(message, error = false) {
        const target = error ? errorBox : notice;
        (error ? notice : errorBox).hidden = true;
        target.textContent = message;
        target.hidden = false;
    }
    function showProblems() {
        find('[data-problem-strip]').replaceChildren(
            ...problems.map((p) => {
                const tag = element('span', 'balloon-problem-tag');
                tag.title = p.title;
                tag.append(badge(p), document.createTextNode(p.name));
                return tag;
            }),
        );
        const state = find('[data-balloon-enabled]');
        state.textContent = enabled ? '自动生成已开启' : '自动生成未开启';
        state.classList.toggle('active', enabled);
    }
    const filtered = () => {
        const query = find('[data-balloon-search]').value.trim().toLowerCase();
        const pid = find('[data-problem-filter]').value;
        return rows.filter(
            (r) =>
                (status === 'all' || r.status === status)
                && (!pid || String(r.pid) === pid)
                && (!query || `${r.team} ${r.className} ${r.username} ${r.classroom || ''} ${r.seat || ''}`.toLowerCase().includes(query)),
        );
    };
    const visibleRows = () => filtered().slice((page - 1) * 50, page * 50);
    function updateSelection() {
        const choices = rows.filter((r) => selected.has(r.id));
        find('[data-selected-count]').textContent = `已选择 ${selected.size} 项`;
        find('[data-balloon-bulk="deliver"]').disabled = busy || !choices.some((r) => r.status === 'pending');
        find('[data-balloon-bulk="undo"]').disabled = busy || !choices.some((r) => r.delivered);
        find('[data-clear-selection]').hidden = !selected.size;
        const visible = visibleRows().filter((r) => !r.withdrawn || r.delivered);
        const checked = visible.filter((r) => selected.has(r.id)).length;
        const toggle = find('[data-balloon-select-all]');
        toggle.checked = !!visible.length && checked === visible.length;
        toggle.indeterminate = checked > 0 && checked < visible.length;
        toggle.disabled = busy || !visible.length;
        find('[data-balloon-select-page]').disabled = busy || !visible.length;
        find('[data-balloon-select-page]').textContent = visible.length && checked === visible.length ? '取消本页选择' : '全选本页';
        for (const checkbox of all('input[data-balloon-id]')) checkbox.checked = selected.has(checkbox.dataset.balloonId);
    }
    function render() {
        for (const id of selected) if (!rows.some((r) => r.id === id)) selected.delete(id);
        for (const el of all('[data-count]')) {
            el.textContent = rows.filter((r) => el.dataset.count === 'total' || r.status === el.dataset.count).length;
        }
        for (const el of all('[data-status]')) {
            el.setAttribute('aria-pressed', String(el.dataset.status === status));
            el.disabled = busy;
        }
        const matches = filtered();
        const pages = Math.max(1, Math.ceil(matches.length / 50));
        page = Math.min(page, pages);
        const children = visibleRows().map((r) => {
            const tr = element('tr');
            tr.dataset.balloonId = r.id;
            const selectCell = element('td');
            const checkbox = element('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.balloonId = r.id;
            checkbox.setAttribute('aria-label', `选择 ${r.team} 的 ${r.label} 题气球`);
            checkbox.checked = selected.has(r.id);
            checkbox.disabled = busy || (r.withdrawn && !r.delivered);
            selectCell.append(checkbox);
            const problem = element('td');
            const preview = element('span', 'balloon-problem-cell');
            preview.append(badge(r), document.createTextNode(r.colorName));
            problem.append(preview);
            const team = element('td');
            const name = element('span', 'balloon-name', r.team);
            team.append(name);
            if (r.first) name.append(element('span', 'balloon-first', '首过'));
            const timestamp = element('td', 'balloon-time', time(r.submittedAt));
            timestamp.title = r.submittedAt;
            const location = element('td', 'balloon-location');
            location.append(element('span', '', r.classroom || '—'), element('small', '', `座位 ${r.seat || '—'}`));
            const state = element('td');
            state.append(
                element('span', `balloon-state ${r.status}`, { pending: '待发放', delivered: '已发放', withdrawn: '已撤销' }[r.status]),
            );
            if (r.push) {
                const assigned = element('small', 'balloon-assigned', r.push.name);
                const notification = element(
                    'small',
                    'balloon-push-state',
                    {
                        pending: pushEnabled ? '等待通知' : '通知已暂停',
                        sending: '正在通知',
                        notified: '已通知',
                        failed: '通知失败',
                        cancelled: '通知已撤销',
                        expired: '链接已过期',
                        done: '已确认发放',
                    }[r.push.status] || '',
                );
                notification.title = r.push.error || (r.push.status === 'notified' ? '通知已发送，等待确认发放' : '');
                state.append(assigned, notification);
            }
            const sender = element('td', '', r.sender || '—');
            if (r.sentAt) sender.append(element('small', 'balloon-sender', time(r.sentAt)));
            const actions = element('td');
            if (!r.withdrawn || r.delivered) {
                const button = element('button', 'balloon-action', r.delivered ? '撤销确认' : '确认已发放');
                button.type = 'button';
                button.dataset.deliveryAction = r.delivered ? 'undo' : 'deliver';
                button.dataset.id = r.id;
                button.disabled = busy;
                actions.append(button);
            } else actions.textContent = '—';
            if (r.status === 'pending') {
                const tools = element('div', 'balloon-push-actions');
                for (const [operation, label] of r.push
                    ? [
                        ['transfer', '转派任务'],
                        ['resend', '重新通知'],
                    ]
                    : [['notify', '分配并通知']]) {
                    const b = element('button', 'balloon-text-button', label);
                    b.type = 'button';
                    b.dataset.pushTask = operation;
                    b.dataset.pushBalloon = r.id;
                    b.dataset.pushJob = r.push?.id || '';
                    b.dataset.pushUid = r.push?.uid || '';
                    const expired = r.push?.expiresAt && +new Date(r.push.expiresAt) <= Date.now();
                    b.disabled = busy || !!expired || (!pushEnabled && operation !== 'transfer');
                    b.title = expired
                        ? '确认链接已过期，可在本站确认发放'
                        : !pushEnabled && operation !== 'transfer'
                            ? '请先开启轮转通知'
                            : '';
                    tools.append(b);
                }
                actions.append(tools);
            }
            tr.append(selectCell, problem, team, element('td', '', r.className), location, timestamp, state, sender, actions);
            return tr;
        });
        const areas = ['pick', 'problem', 'team', 'class', 'location', 'time', 'state', 'courier', 'action'];
        find('[data-balloon-cards]').replaceChildren(
            ...children.map((tr) => {
                const card = element('article', 'balloon-card');
                card.dataset.balloonId = tr.dataset.balloonId;
                for (const [index, td] of [...tr.children].entries()) {
                    const cell = element('div', `balloon-card-${areas[index]}`);
                    cell.append(...td.cloneNode(true).childNodes);
                    card.append(cell);
                }
                return card;
            }),
        );
        find('[data-balloon-rows]').replaceChildren(...children);
        const empty = find('[data-balloon-empty]');
        empty.hidden = !!matches.length;
        empty.textContent =
            find('[data-balloon-search]').value || find('[data-problem-filter]').value
                ? '没有符合筛选条件的气球'
                : { pending: '暂无待发放的气球', delivered: '暂无已发放的气球', withdrawn: '暂无已撤销的气球', all: '暂无气球记录' }[
                    status
                ];
        find('[data-page-info]').textContent = `共 ${matches.length} 项 · 第 ${page} / ${pages} 页`;
        find('[data-balloon-prev]').disabled = busy || page === 1;
        find('[data-balloon-next]').disabled = busy || page === pages;
        updateSelection();
    }
    const apply = (data) => {
        rows = data.rows;
        if (typeof data.enabled === 'boolean') enabled = data.enabled;
        if (typeof data.pushEnabled === 'boolean') pushEnabled = data.pushEnabled;
        if (data.config) problems = problems.map((p) => ({ ...p, ...data.config[p.pid] }));
        showProblems();
        render();
        find('[data-update-time]').textContent = `更新于 ${time(new Date().toISOString())}`;
    };
    async function request(body) {
        let response;
        try {
            response = await fetch(root.dataset.api, {
                method: body ? 'POST' : 'GET',
                credentials: 'same-origin',
                headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
                ...(body ? { body: JSON.stringify({ ...body, csrf: root.dataset.csrf }) } : {}),
                cache: 'no-store',
                signal: AbortSignal.timeout(15000),
            });
        } catch {
            throw new Error('连接暂时中断，请稍后重试');
        }
        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('页面已过期或服务暂不可用，请刷新后重试');
        }
        if (!response.ok || data.error) {
            throw new Error(
                data.error?.name === 'ValidationError'
                    ? data.error.params?.[0] || data.error.message
                    : data.error?.message || data.message || '操作失败，请重试',
            );
        }
        return data;
    }
    async function refresh(manual = false) {
        if (polling || busy || root.querySelector('dialog[open]') || !root.isConnected || (!manual && document.hidden)) return;
        polling = true;
        try {
            apply(await request());
            if (manual) showMessage('已刷新');
        } catch (error) {
            if (manual) showMessage(error.message, true);
        } finally {
            polling = false;
        }
    }
    function confirm(message, label) {
        find('[data-confirm-message]').textContent = message;
        find('[data-confirm-ok]').textContent = label;
        confirmDialog.returnValue = '';
        confirmDialog.showModal();
        return new Promise((resolve) => {
            resolveConfirmation = resolve;
        });
    }
    confirmDialog.addEventListener('close', () => {
        resolveConfirmation?.(confirmDialog.returnValue === 'ok');
        resolveConfirmation = null;
    });
    async function delivery(operation, ids) {
        if (busy || confirmDialog.open || !ids.length) return;
        if (ids.length > 200) {
            showMessage('一次最多操作 200 项，请分批选择', true);
            return;
        }
        if (
            !(await confirm(
                operation === 'undo' ? `撤销这 ${ids.length} 项发放确认？气球将回到待发放列表。` : `确认这 ${ids.length} 项气球已经发放？`,
                operation === 'undo' ? '撤销确认' : '确认已发放',
            ))
        ) { return; }
        busy = true;
        render();
        try {
            apply(await request({ operation, ids }));
            selected.clear();
            showMessage(operation === 'undo' ? '已撤销发放确认' : '已确认发放');
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            busy = false;
            render();
        }
    }
    function renderColors() {
        find('[data-balloon-color-rows]').replaceChildren(
            ...draft.map((p) => {
                const row = element('div', 'balloon-color-row');
                row.dataset.pid = p.pid;
                const heading = element('div', 'balloon-color-title');
                heading.append(badge(p), element('span', '', p.title));
                const options = element('div', 'balloon-color-options');
                const swatches = element('div', 'balloon-palette');
                swatches.setAttribute('role', 'group');
                swatches.setAttribute('aria-label', `${p.label} 题预设颜色`);
                for (const color of palette) {
                    const swatch = element('button', 'balloon-swatch');
                    swatch.type = 'button';
                    swatch.title = color.name;
                    swatch.setAttribute('aria-label', `${p.label} 题 ${color.name}`);
                    swatch.setAttribute('aria-pressed', String(color.color === p.color));
                    swatch.dataset.presetColor = color.color;
                    swatch.style.backgroundColor = color.color;
                    swatch.style.setProperty('--swatch-text', contrast(color.color));
                    swatches.append(swatch);
                }
                const custom = element('div', 'balloon-custom-color');
                const picker = element('input');
                picker.type = 'color';
                picker.value = p.color;
                picker.dataset.colorPicker = '';
                picker.setAttribute('aria-label', `${p.label} 题自定义颜色`);
                const hex = element('input', 'textbox');
                hex.value = p.color;
                hex.dataset.colorHex = '';
                hex.maxLength = 7;
                hex.setAttribute('aria-label', `${p.label} 题色值`);
                hex.pattern = '#[a-fA-F0-9]{6}';
                hex.required = true;
                const label = element('label', '', '名称');
                const name = element('input', 'textbox');
                name.value = p.name;
                name.dataset.colorName = '';
                name.maxLength = 30;
                name.setAttribute('aria-label', `${p.label} 题颜色名称`);
                label.append(name);
                custom.append(picker, hex, label);
                options.append(swatches, custom);
                row.append(heading, options);
                return row;
            }),
        );
    }
    function syncColor(row, color) {
        const p = draft.find((item) => String(item.pid) === row.dataset.pid);
        p.color = color;
        p.name = palette.find((item) => item.color === color)?.name || '自定义';
        row.querySelector('[data-color-picker]').value = color;
        row.querySelector('[data-color-hex]').value = color;
        row.querySelector('[data-color-name]').value = p.name;
        const tag = row.querySelector('.balloon-color-badge');
        tag.style.backgroundColor = color;
        tag.style.color = contrast(color);
        for (const swatch of row.querySelectorAll('[data-preset-color]')) {
            swatch.setAttribute('aria-pressed', String(swatch.dataset.presetColor === color));
        }
    }
    root.addEventListener('click', async (event) => {
        const target = event.target.closest('button');
        if (!target || target.disabled) return;
        // This form owns its pending state; the native page's global submit-click debounce must not swallow retries.
        if (target.type === 'submit' && target.closest('[data-balloon-config-form]')) event.stopPropagation();
        if (target.matches('[data-status]')) {
            status = target.dataset.status;
            selected.clear();
            page = 1;
            render();
        }
        if (target.matches('[data-balloon-refresh]')) refresh(true);
        if (target.matches('[data-clear-selection]')) {
            selected.clear();
            render();
        }
        if (target.matches('[data-balloon-select-page]')) {
            const visible = visibleRows().filter((r) => !r.withdrawn || r.delivered);
            const clear = visible.every((r) => selected.has(r.id));
            for (const row of visible) {
                if (clear) selected.delete(row.id);
                else selected.add(row.id);
            }
            render();
        }
        if (target.matches('[data-balloon-prev]')) {
            page--;
            render();
        }
        if (target.matches('[data-balloon-next]')) {
            page++;
            render();
        }
        if (target.matches('[data-delivery-action]')) delivery(target.dataset.deliveryAction, [target.dataset.id]);
        if (target.matches('[data-balloon-bulk]')) {
            const operation = target.dataset.balloonBulk;
            delivery(
                operation,
                rows.filter((r) => selected.has(r.id) && (operation === 'undo' ? r.delivered : r.status === 'pending')).map((r) => r.id),
            );
        }
        if (target.matches('[data-balloon-configure]') && !busy) {
            draft = structuredClone(problems);
            renderColors();
            configError.hidden = true;
            find('[data-balloon-disable]').hidden = !enabled;
            find('[data-balloon-config-state]').textContent = enabled ? '自动生成已开启' : '保存后开启自动生成';
            configDialog.showModal();
            find('[data-balloon-save]').textContent = enabled ? '保存配色' : '保存并开启';
        }
        if (target.matches('[data-balloon-close]') && !busy) configDialog.close();
        if (target.matches('[data-balloon-defaults]')) {
            draft = draft.map((p, i) => ({ ...p, ...palette[i % 10] }));
            renderColors();
        }
        if (target.matches('[data-preset-color]')) syncColor(target.closest('[data-pid]'), target.dataset.presetColor);
        if (target.matches('[data-confirm-cancel]')) confirmDialog.close('cancel');
        if (target.matches('[data-confirm-ok]')) confirmDialog.close('ok');
        if (target.matches('[data-balloon-disable]') && !busy) {
            if (!(await confirm('暂停生成新的气球？现有配色和发放记录会保留。', '暂停生成气球'))) return;
            busy = true;
            target.disabled = true;
            try {
                apply(await request({ operation: 'disable' }));
                configDialog.close();
                showMessage('已暂停生成气球');
            } catch (error) {
                configError.textContent = error.message;
                configError.hidden = false;
            } finally {
                busy = false;
                target.disabled = false;
                render();
            }
        }
    });
    root.addEventListener('change', (event) => {
        const input = event.target;
        if (input.matches('input[data-balloon-id]')) {
            if (input.checked) selected.add(input.dataset.balloonId);
            else selected.delete(input.dataset.balloonId);
            updateSelection();
        }
        if (input.matches('[data-balloon-select-all]')) {
            for (const row of visibleRows().filter((r) => !r.withdrawn || r.delivered)) {
                if (input.checked) selected.add(row.id);
                else selected.delete(row.id);
            }
            render();
        }
        if (input.matches('[data-problem-filter]')) {
            selected.clear();
            page = 1;
            render();
        }
    });
    root.addEventListener('input', (event) => {
        const input = event.target;
        if (input.matches('[data-balloon-search]')) {
            selected.clear();
            page = 1;
            render();
        }
        if (input.matches('[data-color-picker], [data-color-hex]')) {
            if (/^#[a-fA-F0-9]{6}$/.test(input.value)) syncColor(input.closest('[data-pid]'), input.value.toLowerCase());
        }
        if (input.matches('[data-color-name]')) { draft.find((p) => String(p.pid) === input.closest('[data-pid]').dataset.pid).name = input.value; }
    });
    find('[data-balloon-config-form]').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy || !event.target.reportValidity()) return;
        busy = true;
        const controls = [...event.target.querySelectorAll('button,input,select')].map((el) => [el, el.disabled]);
        for (const [el] of controls) el.disabled = true;
        find('[data-balloon-save]').textContent = '正在保存…';
        configError.hidden = true;
        try {
            const data = await request({
                operation: 'configure',
                config: Object.fromEntries(draft.map((p) => [p.pid, { color: p.color, name: p.name }])),
            });
            apply(data);
            configDialog.close();
            showMessage('配色已保存，气球已启用');
        } catch (error) {
            configError.textContent = error.message;
            configError.hidden = false;
        } finally {
            busy = false;
            for (const [el, disabled] of controls) el.disabled = disabled;
            find('[data-balloon-save]').textContent = enabled ? '保存配色' : '保存并开启';
            render();
        }
    });
    configDialog.addEventListener('cancel', (event) => {
        if (busy) event.preventDefault();
    });
    const timer = setInterval(() => {
        if (!root.isConnected) clearInterval(timer);
        else refresh();
    }, 10000);
    root.addEventListener('balloon-push-refresh', async (event) => {
        await refresh();
        showMessage(event.detail?.message || '通知状态已更新');
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && root.isConnected) refresh();
    });
    showProblems();
    render();
})();
