(() => {
    const { NamedPage } = window.Hydro;
    const { $ } = window.node_modules;
    const { request, i18n, tpl } = window.Hydro.utils;
    const { ConfirmDialog } = window.Hydro.components;

    const page = new NamedPage('course_detail', async () => {
        $(document).on('click', '[name="course_buy"]', async (ev) => {
            const message = '购买课程';
            const action = await new ConfirmDialog({
                $body: tpl`
                <div class="typo">
                  <h3>${i18n(message)}</h3>
                </div>`,
            }).open();
            if (action !== 'yes') return;
            window.open(`/course/buy/${UiContext.cdoc._id}`, '_blank');
        });
    });

    window.Hydro.extraPages.push(page);
})();
