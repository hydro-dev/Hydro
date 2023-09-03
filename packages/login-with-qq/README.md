# Login-With-QQ
API采用QQ互联，需在[QQ互联](https://connect.qq.com/)申请API后，在控制面板内填入appid和appkey，方可使用该插件。

该插件由[air.](https://github.com/air-adteam)制作。

因作者技术能力问题，无法在安全设置页面上添加绑定按钮。请自行参考[hydro前端修改文档](https://hydro.js.org/docs/system/frontend-modify/)，并在最后加入以下代码添加：
```html
<div class="section">
    <div class="section__header">
        <h1 class="section__title" id="qq" data-heading>{{ _('binding') }}</h1>
    </div>
    <div class="section__body">
        <p>{{ _('jump') }}</p><br>
        <a href="/oauth/qq" class="primary rounded button">{{ _('bind_and_binding') }}</a>
    </div>
</div>
```