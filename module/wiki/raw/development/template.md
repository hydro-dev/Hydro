# Template

页面模板，使用 nunjucks 语法。  
传入了 _ 翻译函数与 model 等。

```html
{% set page_name = "page_name" %}
{% extends "layout/basic.html" %}
{% block content %}
<div class="error__container clearfix">
  <div class="error__icon-container">
    <div class="error__twd2"></div>
  </div>
  <div class="error__text-container">
    <h1>{{ _('Oops!') }}</h1>
    <p>{{ _(error.message).format(error.params) }}</p>
    <p>{{ _('Technical Information') }}:</p>
    <p>{{ _('Type') }}: {{ error.code }}</p>
    <p>{{ _('Arguments') }}:
      <ol>
      {% for param in error.params %}
        <li>{{ param }}</li>
      {% endfor %}
      </ol>
    </p>
  </div>
</div>
{% endblock %}
```

<blockquote class="note">请不要覆盖已有模板。</blockquote>