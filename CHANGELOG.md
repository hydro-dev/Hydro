## Changes for hydrooj@3:

- 重构了 server 结构：
- - 移除了 `Handler.init` `Handler.finish` 方法。
- - 移除了 `handler/finish` 钩子。
- - 移除了 `requireCsrfToken` 。
- - 移除了 `sockjs`，转为使用原生 `WebSocket` 。
