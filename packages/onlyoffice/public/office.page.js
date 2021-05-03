(() => {
    const { AutoloadPage } = window.Hydro;
    const { $ } = window.node_modules;
    const { request } = window.Hydro.utils;

    const page = new AutoloadPage('onlyoffice', async () => {
        const res = $('div[data-doc]');
        if (res.length) {
            await new Promise((resolve) => {
                const scriptElement = document.createElement('script');
                scriptElement.src = UiContext.onlyofficeApi;
                scriptElement.async = true;
                document.head.appendChild(scriptElement);
                scriptElement.onload = resolve;
            });
        }
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
    });

    window.Hydro.extraPages.push(page);
})();
