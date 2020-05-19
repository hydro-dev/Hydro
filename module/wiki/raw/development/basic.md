# Basic

Hydro 后端使用 NodeJS 编写，前端使用 JQuery + React。
代码风格遵循 airbnb 标准（详见 .eslintrc.js）。

由于模块中不能使用 require() 引入 Hydro 的文件，因此需要从 global.Hydro 中取出需要的模块。  
例： 

```js
const { db } = global.Hydro.service;
const { problem } = global.Hydro.model;
```
