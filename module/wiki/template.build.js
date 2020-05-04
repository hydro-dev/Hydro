const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

exports.prebuild = () => {
    const templates = {};
    templates['layout/wiki_base.html'] = fs.readFileSync(`${__dirname}/wiki_base.html`).toString();
    const pages = fs.readdirSync(path.resolve(__dirname, 'raw'));
    for (const page of pages) {
        const f = fs.readFileSync(path.resolve(__dirname, 'raw', page)).toString();
        const file = yaml.safeLoad(f);
        let template = `
        {% set page_name="wiki_${page.split('.')[0]}" %}
        {% extends "layout/wiki_base.html" %}
        {% block wiki_content %}`;
        for (const section of file.section) {
            template += `
            <div class="section" data-heading-extract-to="${file['data-heading-extract-to']}">
                <div class="section__header">
                    <h1 class="section__title" id="${section.id}" data-heading>{{ _('${section.title.replace(/'/gmi, '\\\'')}') }}</h1>
                </div>
                <div class="section__body typo">{{ _('no_translation_warn')|safe }}${section.content}</div>
            </div>`;
        }
        template += '{% endblock %}';
        templates[`wiki_${page.split('.')[0]}.html`] = template;
    }
    return [templates, []];
};
