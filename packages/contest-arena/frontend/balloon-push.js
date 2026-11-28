(() => {
    'use strict';
    const root = document.getElementById('balloon-manager');
    if (!root || root.dataset.pushBound) return;
    root.dataset.pushBound = 'true';
    const find = (selector) => root.querySelector(selector);
    const dialog = find('[data-push-dialog]');
    const actionDialog = find('[data-push-action-dialog]');
    const form = find('[data-push-form]');
    const actionForm = find('[data-push-action-form]');
    const actionButton = find('[data-push-action-submit]');
    const saveButton = find('[data-push-save]');
    let settings = null;
    let draft = [];
    let busy = false;
    let action = null;
    let actionReady = false;
    const element = (tag, cls = '', text = '') => {
        const el = document.createElement(tag);
        el.className = cls;
        el.textContent = text;
        return el;
    };
    const feedback = (selector, message) => {
        const el = find(selector);
        el.textContent = message;
        el.hidden = false;
    };
    const changed = (message) => root.dispatchEvent(new CustomEvent('balloon-push-refresh', { detail: { message } }));
    const labels = { transfer: '确认转派', resend: '重新发送通知', notify: '分配并通知' };
    function lock(target) {
        busy = true;
        target.setAttribute('aria-busy', 'true');
        const controls = [...target.querySelectorAll('button,input,select')].map((el) => [el, el.disabled]);
        for (const [el] of controls) {
            el.disabled = true;
        }
        return () => {
            for (const [el, disabled] of controls) {
                el.disabled = disabled;
            }
            target.setAttribute('aria-busy', 'false');
            busy = false;
        };
    }
    async function request(body) {
        let response;
        try {
            response = await fetch(root.dataset.pushApi, {
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
        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error('页面已过期或服务暂不可用，请刷新后重试');
        }
        if (!response.ok || result.error) {
            throw new Error(
                result.error?.name === 'ValidationError'
                    ? result.error.params?.[0] || result.error.message
                    : result.error?.message || result.message || '操作失败，请重试',
            );
        }
        return result;
    }
    const sameAccount = (r) => [r.username, String(r.uid)].includes(r.account.trim());
    function renderRunners() {
        find('[data-push-empty]').hidden = !!draft.length;
        find('[data-add-runner]').disabled = draft.length >= 20;
        find('[data-push-runners]').replaceChildren(
            ...draft.map((r, i) => {
                const row = element('div', 'balloon-runner-row');
                row.dataset.runner = String(i);
                row.append(element('span', 'balloon-runner-order', String(i + 1)));
                const identity = element('label', 'balloon-runner-field', 'OJ 用户名 / UID');
                const account = element('input', 'textbox');
                account.type = 'text';
                account.required = true;
                account.maxLength = 100;
                account.value = r.account;
                account.dataset.runnerAccount = '';
                account.placeholder = '输入用户名或 UID';
                account.setAttribute('aria-label', `第 ${i + 1} 位发放员账号`);
                identity.append(account);
                const name = element('small', '', sameAccount(r) ? r.name : '');
                name.dataset.runnerName = '';
                identity.append(name);
                const secret = element('label', 'balloon-runner-field', 'WxPusher SPT');
                const spt = element('input', 'textbox');
                spt.type = 'password';
                spt.autocomplete = 'new-password';
                spt.maxLength = 512;
                spt.value = r.spt || '';
                spt.dataset.runnerSpt = '';
                spt.required = !r.hasSpt || !sameAccount(r);
                spt.placeholder = r.hasSpt && sameAccount(r) ? '已配置，留空保留' : '输入该发放员的 SPT_…';
                spt.setAttribute('aria-label', `第 ${i + 1} 位发放员 SPT`);
                secret.append(spt);
                const tools = element('div', 'balloon-runner-tools');
                const active = element('label');
                const check = element('input');
                check.type = 'checkbox';
                check.checked = r.active;
                check.dataset.runnerActive = '';
                check.setAttribute('aria-label', `第 ${i + 1} 位发放员接收新任务`);
                active.append(check, document.createTextNode('接收新任务'));
                tools.append(active);
                const moves = element('div', 'balloon-runner-moves');
                for (const [value, label] of [
                    ['up', '上移'],
                    ['down', '下移'],
                    ['remove', '移除'],
                ]) {
                    const b = element('button', 'balloon-text-button', label);
                    b.type = 'button';
                    b.dataset.runnerMove = value;
                    b.setAttribute('aria-label', `${label}第 ${i + 1} 位发放员`);
                    b.disabled = (value === 'up' && i === 0) || (value === 'down' && i === draft.length - 1);
                    moves.append(b);
                }
                tools.append(moves);
                if (r.uid && r.hasSpt) {
                    const test = element('button', 'balloon-text-button', '发送测试通知');
                    test.type = 'button';
                    test.dataset.runnerTest = String(r.uid);
                    tools.append(test);
                }
                row.append(identity, secret, tools);
                return row;
            }),
        );
    }
    function updateRunner(event) {
        const row = event.target.closest('[data-runner]');
        if (!row || busy) return;
        const item = draft[Number(row.dataset.runner)];
        if (!item) return;
        if (event.target.matches('[data-runner-account]')) {
            item.account = event.target.value;
            const spt = row.querySelector('[data-runner-spt]');
            spt.required = !item.hasSpt || !sameAccount(item);
            spt.placeholder = item.hasSpt && sameAccount(item) ? '已配置，留空保留' : '输入该发放员的 SPT_…';
            row.querySelector('[data-runner-name]').textContent = sameAccount(item) ? item.name : '';
        }
        if (event.target.matches('[data-runner-spt]')) item.spt = event.target.value;
        if (event.target.matches('[data-runner-active]')) item.active = event.target.checked;
    }
    root.addEventListener('input', updateRunner);
    root.addEventListener('change', updateRunner);
    root.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.type === 'submit' && button.closest('[data-push-form], [data-push-action-form]')) event.stopPropagation();
        if (busy || button.disabled) return;
        if (button.matches('[data-open-push]')) {
            settings = null;
            draft = [];
            saveButton.disabled = true;
            form.reset();
            renderRunners();
            find('[data-push-error]').hidden = true;
            find('[data-push-notice]').hidden = true;
            find('[data-next-runner]').textContent = '正在加载…';
            dialog.showModal();
            const unlock = lock(form);
            try {
                settings = await request();
                find('[data-push-enabled]').checked = settings.enabled;
                find('[data-push-base]').value = settings.baseUrl;
                find('[data-next-runner]').textContent = settings.nextName ? `下一位：${settings.nextName}` : '';
                draft = settings.runners.map((r) => ({ ...r, account: r.username || String(r.uid), spt: '' }));
            } catch (e) {
                feedback('[data-push-error]', e.message);
                find('[data-next-runner]').textContent = '';
            } finally {
                unlock();
                renderRunners();
                saveButton.disabled = !settings;
            }
        }
        if (button.matches('[data-push-close]')) dialog.close();
        if (button.matches('[data-push-action-close]')) actionDialog.close();
        if (button.matches('[data-add-runner]') && draft.length < 20) {
            draft.push({ account: '', spt: '', active: true, hasSpt: false });
            renderRunners();
        }
        if (button.matches('[data-runner-test]')) {
            const row = draft[Number(button.closest('[data-runner]').dataset.runner)];
            find('[data-push-error]').hidden = true;
            find('[data-push-notice]').hidden = true;
            if (row.spt || !sameAccount(row)) {
                feedback('[data-push-error]', '请先保存修改后的账号和 SPT，再发送测试通知');
                return;
            }
            const unlock = lock(form);
            button.textContent = '正在发送…';
            try {
                await request({ operation: 'test', uid: Number(button.dataset.runnerTest) });
                feedback('[data-push-notice]', '测试通知已发送，请检查微信。');
            } catch (e) {
                feedback('[data-push-error]', e.message);
            } finally {
                unlock();
                button.textContent = '发送测试通知';
            }
        }
        if (button.matches('[data-runner-move]')) {
            const i = Number(button.closest('[data-runner]').dataset.runner);
            const move = button.dataset.runnerMove;
            if (move === 'remove') draft.splice(i, 1);
            else {
                const j = i + (move === 'up' ? -1 : 1);
                if (j < 0 || j >= draft.length) return;
                [draft[i], draft[j]] = [draft[j], draft[i]];
            }
            renderRunners();
        }
        if (button.matches('[data-push-task]')) {
            action = { operation: button.dataset.pushTask, id: button.dataset.pushJob, balloon: button.dataset.pushBalloon };
            settings = null;
            actionReady = false;
            actionButton.disabled = true;
            actionButton.textContent = labels[action.operation];
            actionForm.reset();
            actionDialog.showModal();
            find('[data-push-action-error]').hidden = true;
            find('[data-push-action-title]').textContent = { transfer: '转派气球任务', resend: '重新发送通知', notify: '分配并通知' }[
                action.operation
            ];
            find('[data-push-action-message]').textContent = '正在加载…';
            const transfer = action.operation === 'transfer';
            const select = find('[data-transfer-runner]');
            find('[data-transfer-label]').hidden = !transfer;
            select.disabled = !transfer;
            select.required = transfer;
            const unlock = lock(actionForm);
            try {
                settings = await request();
                const placeholder = element('option', '', '请选择发放员');
                placeholder.value = '';
                const currentUid = Number(button.dataset.pushUid);
                const options = settings.runners.filter((r) => r.uid !== currentUid);
                select.replaceChildren(
                    placeholder,
                    ...options.map((r) => {
                        const o = element('option', '', r.name + (r.active ? '' : '（暂停接收新任务）'));
                        o.value = r.uid;
                        return o;
                    }),
                );
                actionReady = transfer ? options.length > 0 : settings.enabled;
                find('[data-push-action-message]').textContent = transfer
                    ? settings.enabled
                        ? '转派后旧链接失效，新发放员将收到通知。'
                        : '通知已暂停。任务会立即转派，开启通知后再发送。'
                    : action.operation === 'notify'
                        ? '按当前顺序分配给下一位发放员。'
                        : '发送新的通知，原通知链接将失效。';
                if (!actionReady) feedback('[data-push-action-error]', transfer ? '请先在通知设置中添加其他发放员' : '请先开启轮转通知');
            } catch (e) {
                feedback('[data-push-action-error]', e.message);
                find('[data-push-action-message]').textContent = '';
            } finally {
                unlock();
                actionButton.disabled = !actionReady;
                select.disabled = !transfer;
            }
        }
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy || !settings || !form.reportValidity()) return;
        const unlock = lock(form);
        saveButton.textContent = '正在保存…';
        find('[data-push-error]').hidden = true;
        try {
            await request({
                operation: 'configure',
                revision: settings.revision,
                enabled: find('[data-push-enabled]').checked,
                baseUrl: find('[data-push-base]').value.trim(),
                runners: draft.map((r) => ({ account: r.account.trim(), spt: r.spt, active: r.active })),
            });
            dialog.close();
            changed('通知设置已保存');
        } catch (e) {
            feedback('[data-push-error]', e.message);
        } finally {
            unlock();
            saveButton.textContent = '保存通知设置';
        }
    });
    actionForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy || !action || !actionReady || !actionForm.reportValidity()) return;
        const unlock = lock(actionForm);
        actionButton.textContent = '正在处理…';
        find('[data-push-action-error]').hidden = true;
        try {
            await request({ ...action, ...(action.operation === 'transfer' ? { uid: Number(find('[data-transfer-runner]').value) } : {}) });
            actionDialog.close();
            changed(action.operation === 'transfer' ? '任务已转派' : '通知已加入发送队列');
        } catch (e) {
            feedback('[data-push-action-error]', e.message);
        } finally {
            unlock();
            actionButton.textContent = labels[action.operation];
        }
    });
    function preventBusyCancel(event) {
        if (busy) event.preventDefault();
    }
    for (const modal of [dialog, actionDialog]) modal.addEventListener('cancel', preventBusyCancel);
    dialog.addEventListener('close', () => {
        draft = [];
        find('[data-push-runners]').replaceChildren();
    });
})();
