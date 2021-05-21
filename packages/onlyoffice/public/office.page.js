(() => {
    const { AutoloadPage } = window.Hydro;
    const { $ } = window.node_modules;
    const { request } = window.Hydro.utils;

    let loaded = false;
    async function load() {
        if (loaded) return Promise.resolve();
        return new Promise((resolve) => {
            const scriptElement = document.createElement('script');
            scriptElement.src = UiContext.onlyofficeApi;
            scriptElement.async = true;
            document.head.appendChild(scriptElement);
            scriptElement.onload = resolve;
            loaded = true;
        });
    }

    const page = new AutoloadPage('onlyoffice', async () => {
        let res = $('div[data-doc]');
        if (res.length) await load();
        res.get().forEach(async (element) => {
            const id = `doc-${Math.random().toString()}`;
            $(element).attr('id', id);
            const url = $(element).text();
            const t = new URL(url, window.location.href).pathname.split('.');
            const n = new URL(url, window.location.href).pathname.split('/');
            const res = await request.get(url);
            const lang = UserContext.viewLang.includes('_') ? UserContext.viewLang.split('_')[0] : UserContext.viewLang;
            // eslint-disable-next-line no-undef
            window.editor = new DocsAPI.DocEditor(id, {
                document: {
                    fileType: t[t.length - 1],
                    key: Math.random().toString(16),
                    title: n[n.length - 1],
                    url: new URL(res.url, window.location.href),
                },
                editorConfig: {
                    lang,
                    mode: 'view',
                },
                documentType: 'word',
                height: '980px',
            });
        });
        res = $('div[data-cell]');
        if (res.length) await load();
        res.get().forEach(async (element) => {
            const id = `cell-${Math.random().toString()}`;
            $(element).attr('id', id);
            const url = $(element).text();
            const t = new URL(url, window.location.href).pathname.split('.');
            const n = new URL(url, window.location.href).pathname.split('/');
            const res = await request.get(url);
            const lang = UserContext.viewLang.includes('_') ? UserContext.viewLang.split('_')[0] : UserContext.viewLang;
            // eslint-disable-next-line no-undef
            window.editor = new DocsAPI.DocEditor(id, {
                document: {
                    fileType: t[t.length - 1],
                    key: Math.random().toString(16),
                    title: n[n.length - 1],
                    url: new URL(res.url, window.location.href),
                },
                editorConfig: {
                    lang,
                    mode: 'cell',
                },
                documentType: 'word',
                height: '980px',
            });
        });
        res = $('div[data-slide]');
        if (res.length) await load();
        res.get().forEach(async (element) => {
            const id = `slide-${Math.random().toString()}`;
            $(element).attr('id', id);
            const url = $(element).text();
            const t = new URL(url, window.location.href).pathname.split('.');
            const n = new URL(url, window.location.href).pathname.split('/');
            const res = await request.get(url);
            const lang = UserContext.viewLang.includes('_') ? UserContext.viewLang.split('_')[0] : UserContext.viewLang;
            // eslint-disable-next-line no-undef
            window.editor = new DocsAPI.DocEditor(id, {
                document: {
                    fileType: t[t.length - 1],
                    key: Math.random().toString(16),
                    title: n[n.length - 1],
                    url: new URL(res.url, window.location.href),
                },
                editorConfig: {
                    lang,
                    mode: 'slide',
                },
                documentType: 'word',
                height: '980px',
            });
        });
    });

    window.Hydro.extraPages.push(page);
})();
