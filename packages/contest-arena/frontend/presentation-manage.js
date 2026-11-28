(() => {
    if (window.hgnuPresentationManage) return;
    window.hgnuPresentationManage = true;
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-copy-target], [data-toggle-presentation-password]');
        const page = button?.closest('[data-presentation-page]');
        if (!page) return;
        if (button.hasAttribute('data-toggle-presentation-password')) {
            const input = page.querySelector('#presentation-password');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.textContent = show ? '隐藏' : '显示';
            button.setAttribute('aria-label', show ? '隐藏连接密码' : '显示连接密码');
            button.setAttribute('aria-pressed', String(show));
            return;
        }
        const input = document.getElementById(button.dataset.copyTarget);
        if (!input || !page.contains(input)) return;
        const status = page.querySelector('[data-presentation-copy-status]');
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(input.value);
            else {
                const copy = document.createElement('textarea');
                copy.value = input.value;
                copy.setAttribute('readonly', '');
                copy.style.position = 'fixed';
                copy.style.left = '-9999px';
                document.body.append(copy);
                copy.select();
                const copied = document.execCommand('copy');
                copy.remove();
                button.focus();
                if (!copied) throw new Error('Copy failed');
            }
            status.textContent = `已复制${button.dataset.copyLabel}`;
        } catch {
            input.focus();
            input.select();
            status.textContent = '复制失败，请选中内容手动复制。';
        }
    });
    document.addEventListener('submit', (event) => {
        if (!event.target.matches('[data-presentation-actions]')) return;
        // eslint-disable-next-line no-alert -- Resetting credentials invalidates every connected display client.
        if (event.submitter?.value === 'reset' && !window.confirm('重置后，已下载的启动包将失效，需要重新下载。是否继续？')) {
            event.preventDefault();
        }
    });
})();
