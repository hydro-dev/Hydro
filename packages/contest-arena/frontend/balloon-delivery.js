(() => {
    'use strict';
    const shell = document.querySelector('[data-delivery-id]');
    if (!shell) return;
    const id = shell.dataset.deliveryId;
    const key = `hgnu-balloon-delivery:${id}`;
    let token = location.hash.slice(1);
    let busy = false;
    try {
        if (/^[a-f0-9]{64}$/.test(token)) sessionStorage.setItem(key, token);
        else token = sessionStorage.getItem(key) || '';
    } catch {}
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    const get = (name) => shell.querySelector(`[data-${name}]`);
    const card = shell.querySelector('.delivery-card');
    const button = document.getElementById('delivery-confirm');
    const fail = (message) => {
        get('error').textContent = message;
        get('error').hidden = false;
    };
    const render = (task) => {
        get('task').hidden = false;
        get('error').hidden = true;
        for (const [field, name] of [
            ['contest', 'contest'],
            ['team', 'team'],
            ['className', 'class'],
            ['receiver', 'receiver'],
            ['colorName', 'color-name'],
            ['label', 'label'],
        ]) { get(name).textContent = task[field]; }
        get('classroom').textContent = task.classroom || '未填写';
        get('seat').textContent = task.seat || '未填写';
        const color = /^#[a-f0-9]{6}$/i.test(task.color) ? task.color : '#808080';
        get('label').style.backgroundColor = color;
        const rgb = color
            .slice(1)
            .match(/../g)
            .map((v) => Number.parseInt(v, 16));
        get('label').style.color = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 >= 128 ? '#000' : '#fff';
        get('status').classList.toggle('done', task.delivered);
        get('status').textContent = task.delivered ? '此气球已发放' : '待发放';
        button.disabled = task.delivered;
        button.textContent = task.delivered ? '已确认发放' : '确认已发放';
        get('receipt').hidden = !task.delivered;
        get('receipt').textContent = task.delivered
            ? `${task.sender || task.receiver}${
                task.sentAt ? ` · ${new Date(task.sentAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}` : ''
            }`
            : '';
    };
    async function request(confirm = false) {
        if (busy) return;
        busy = true;
        card.setAttribute('aria-busy', 'true');
        button.disabled = true;
        get('retry').hidden = true;
        get('error').hidden = true;
        if (confirm) button.textContent = '正在确认…';
        let retry = true;
        try {
            if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) {
                retry = false;
                throw new Error('链接无效或已过期，请联系比赛管理员');
            }
            const response = await fetch(`/balloon-delivery/${id}/api`, {
                method: confirm ? 'POST' : 'GET',
                credentials: 'omit',
                headers: {
                    Accept: 'application/json',
                    'X-Balloon-Token': token,
                    ...(confirm ? { 'Content-Type': 'application/json' } : {}),
                },
                ...(confirm ? { body: JSON.stringify({ operation: 'confirm' }) } : {}),
                cache: 'no-store',
                signal: AbortSignal.timeout(15000),
            });
            if (response.status === 403) retry = false;
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.message || '暂时无法处理，请稍后重试');
            render(data.task);
        } catch (error) {
            fail(
                error.name === 'TypeError' || error.name === 'TimeoutError' || error.name === 'AbortError'
                    ? '连接暂时中断，请重新加载任务'
                    : error.message || '暂时无法处理，请重新加载任务',
            );
            get('retry').hidden = !retry;
            button.disabled = true;
            button.textContent = '确认已发放';
            if (!retry) get('task').hidden = true;
        } finally {
            busy = false;
            card.setAttribute('aria-busy', 'false');
            get('loading').hidden = true;
        }
    }
    button.addEventListener('click', () => request(true));
    get('retry').addEventListener('click', () => request());
    request();
})();
