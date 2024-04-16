# codemate-plugin

该package存放codemate相关特色功能的插件集合，目前包含了：

- assign-problem-list: 特殊题单插件，仅系统管理员可以创建和管理，用于首页的赛事题单，主要功能为提供题库筛选、做题时快速切换的上下文与题单级别的权限管理
- privilege-group：权限组插件，拓展了原有的`user.group` coll，添加了树状权限组和相关API，是一个抽象的权限树实现。

## 开发指南

如果没有需要（如只是需要添加功能），**请新建子插件，不要修改母插件**。

1. 在`./plugins`下创建一个插件目录，下面包含`index.ts`或`index.js`
2. 确保导出（**非默认导出**）`apply(ctx)`函数
3. 该插件（仅用于自动加载其下的所有插件）和`./plugins`下的所有插件都会被自动加载

### 日志输出建议

请使用`./api.ts`导出的`logger`对象打印日志，可以获得与原生一致的日志格式：

- 包含完整时间戳、内容等级分类（info, error, warning等），以及作用域显示（codemate）
- debug时使用的`console.log`请在PR时删除，有用信息请使用`logger.info`输出记录

### 添加HTML模板

如果你需要添加新的HTML模板，请在顶层插件目录的`templates`目录下添加html即可，相关加载代码可见`/packages/hydrooj/src/entry/worker.ts`。

- **只有顶层插件（codemate-plugin）会以Hydro插件的形式加载**（即包含`lib`, `template`等内容的完整加载）
- 子插件都是简单地在母插件的`apply`中调用其`apply`到`ctx`上，不会加载template等内容

## 运作机制

### 母插件是什么时候加载的？

参考hydro架构，hydro的一切功能都是通过插件挂载的，通过**修改core的加载代码**可以让我们的插件获得近似native插件的加载优先级。

- 在`packages/hydrooj/src/loader.ts`的`load()`函数中，我们可以看到使用`addon()`函数加载了`hydooj`
- 我们在其后加上自己的插件即可（注意不要prepend，如果我们先于`hydrooj`初始化了会引发错误）

### 子插件是怎么加载的？

> 加载机制其实和Hydro内部的机制相似，只是省略了`template`等其他部分的加载，只调用了`apply`函数

在母插件的`apply()`函数里通过`fs`读取`plugins/`目录下的所有插件，动态导入其`index`模块，查找其名为`apply`的导出，并应用到`ctx`上。