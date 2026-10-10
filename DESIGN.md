---
name: 青石练习场
description: 冷灰蓝训练台。衬线站名，蓝到青的一个主动作，白卡片，底下一条深色路径。
colors:
  field: "#e8eef5"
  field-soft: "#f4f7fb"
  ink: "#111827"
  muted: "#5f6b7a"
  line: "rgba(30, 41, 59, 0.09)"
  surface: "rgba(248, 250, 252, 0.8)"
  surface-strong: "rgba(255, 255, 255, 0.9)"
  brand: "#2563eb"
  brand-deep: "#1e40af"
  mint: "#6fa7b3"
  gold: "#bfa46a"
  gold-deep: "#8e7341"
  path: "#172237"
  path-ink: "#f6f8fd"
  pass-ink: "#145c32"
  pass-wash: "#e5f2ea"
  warn-ink: "#6a4b00"
  warn-wash: "#f8f1dc"
  fail-ink: "#8a1f1f"
  fail-wash: "#f8e6e6"
typography:
  display:
    fontFamily: "Source Han Serif SC, Noto Serif SC, Songti SC, serif"
    fontSize: "clamp(52px, 5.4vw, 78px)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "Source Han Serif SC, Noto Serif SC, Songti SC, serif"
    fontSize: "clamp(32px, 4vw, 48px)"
    fontWeight: 760
    lineHeight: 1.16
    letterSpacing: "-0.045em"
  title:
    fontFamily: "Source Han Serif SC, Noto Serif SC, Songti SC, serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Open Sans, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: "normal"
  label:
    fontFamily: "Open Sans, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.14em"
  mono:
    fontFamily: "JetBrains Mono, Cascadia Code, monospace"
    fontSize: "30px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  hero: "30px"
  card: "24px"
  countdown: "16px"
  button: "11px"
  chip: "999px"
spacing:
  gutter: "20px"
  grid: "22px"
  grid-wide: "30px"
  card: "24px"
  action: "12px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "#ffffff"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "50px"
  button-secondary:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.brand-deep}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "50px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  hero:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hero}"
    padding: "58px 26px 48px"
---

# Design System: 青石练习场

## Overview

**Creative North Star: "冷色训练台"**

首页按 [dtoj.team](https://dtoj.team/) 2026-10-10 的桌面卡片记录。底是冷灰蓝。站名用衬线，颜色落在训练蓝上，下面只留一条短的蓝青线。主动作是一枚拉满宽度的按钮，从品牌蓝过渡到青。打卡和倒计时各自一种卡片：打卡是虚线奶油内嵌，倒计时是奶油底上的白条。

本站品牌仍是「青石练习场」。参考站的站名、商标、联系人、二维码、邮箱和公告原文不进入这套系统。这里记的是分区、颜色、字体和组件，不是文案。

窄屏（600px 及以下）参考站会收成白底、去掉漂浮符号、主按钮改成一块深青。桌面规则优先；窄屏只减装饰，不换一套色。

**Key Characteristics:**

- 冷灰蓝场地，白卡片浮在上面，阴影很轻、偏移向下。
- 站名是衬线、训练蓝。蓝青渐变只给短线和那一枚主按钮。金色只给倒计时的第二组。
- 先是居中的入口卡片，然后是打卡和倒计时两种卡片，最后用深色块把题库、课程、比赛、复盘串起来。

## Colors

一块偏冷的纸。蓝是入口，青是同一支笔的尾端，金是倒计时里的第二声。

### Primary

- **训练蓝** ({colors.brand}): 站名渐变的中段，主按钮的起点，焦点环。
- **深蓝** ({colors.brand-deep}): 站名渐变的起点，次按钮文字，倒计时主数字。
- **青** ({colors.mint}): 站名渐变和主按钮的末端，标题下那条短线的右端。

### Secondary

- **金** ({colors.gold}): 徽章上的一点，倒计时第二项的边。
- **深金** ({colors.gold-deep}): 倒计时第二项的数字。

### Neutral

- **墨** ({colors.ink}): 标题和正文。
- **备注** ({colors.muted}): 说明、倒计时附注。
- **场地** ({colors.field}): 页面底。左上有一块品牌蓝的径向光，右上有一块灰蓝的径向光，上面再铺一层很淡的网格。
- **软场地** ({colors.field-soft}): 倒计时面板内部更浅的一层。
- **雾面** ({colors.surface}): 普通卡片。
- **亮雾面** ({colors.surface-strong}): 首屏面板和主按钮的底。
- **线** ({colors.line}): 卡片边，大约 9% 的墨。

### Path

- **路径夜** ({colors.path}): 学习路径那一整块的底。
- **路径字** ({colors.path-ink}): 这块上的标题。说明用更灰的蓝白，不另设一个色值。

### Status

评测队列用，不进首页。

- **通过绿** ({colors.pass-ink} on {colors.pass-wash})
- **待定褐** ({colors.warn-ink} on {colors.warn-wash})
- **错误红** ({colors.fail-ink} on {colors.fail-wash})

**The One Entrance Rule.** 一屏里从蓝过渡到青的填充只有那一枚主按钮和站名下的短线。次按钮、领羊币、打卡底部动作和倒计时卡片保持浅底。

## Typography

**Display Font:** Source Han Serif SC，其次 Noto Serif SC、Songti SC
**Body Font:** Open Sans，中文落到 PingFang SC、冬青黑体、微软雅黑
**Label/Mono Font:** 倒计时数字和首屏角落的符号用 JetBrains Mono，其次 Cascadia Code

**Character:** 站名重、紧、衬线。说明轻、无衬线、行距接近 1.9。数字不跟正文混用字体。

### Hierarchy

- **Display** (700, clamp(52px, 5.4vw, 78px), 1.18): 首页站名。字距 -0.055em。颜色用训练蓝，不把渐变铺进字里。
- **Headline** (760, clamp(32px, 4vw, 48px), 1.16): 路径区和资料区的大标题。字距 -0.045em。
- **Title** (800, 22px): 卡片标题。倒计时条目用 17px、字重 800 的无衬线，不升到衬线。
- **Body** (400, 14px, 1.9): 卡片说明。最长大约 370px 到 720px，看它是侧栏还是主标题下的那一句。
- **Label** (700, 12px, 字距 0.14em): 站名上方的一行小字，以及倒计时上的短标签。
- **Mono** (900, 30px, 行高 1): 倒计时天数。单位是 12px 无衬线。

**The Serif Once Rule.** 衬线只给站名、区块大标题和卡片标题。按钮、芯片、倒计时附注和正文保持无衬线。

## Layout

内容宽最多 1180px，两侧各留 20px。首页竖着四段：

1. 居中首屏。白面板，大圆角。站名、一条短的蓝青线、一句用途。三个动作竖排并且拉满面板宽度：上面一枚蓝青主按钮，下面两枚浅底次按钮。再下面是两列文字入口。角落有很淡的等宽符号，不接收点击。
2. 两列板。列距 30px，行距 22px。左上倒计时，右上打卡；左下羊币和装扮，右下四项活动。窄屏改成一列，顺序是打卡、倒计时、资产、活动。打卡、倒计时和首屏是三种不同的卡片，不要收成同一种白盒子。
3. 公告，然后才是联系。联系在参考站上是成对的卡片；本站没有教师提供的联系方式之前，这一段留空，不放参考站的人和码。
4. 深色路径带。左列四步，右列一块预览。再下面是资料入口，宽屏三列，中屏两列，窄屏一列。

**The Path Band Rule.** 题库、课程、比赛、复盘放在同一块深色里，用步骤而不是四张相同的白卡片。

## Elevation & Depth

卡片用向下的软阴影，不是平贴。普通卡片大约 `0 28px 70px rgba(28, 39, 64, 0.1)`，首屏和次要卡片更轻：`0 16px 40px rgba(28, 39, 64, 0.07)`。悬停把卡片上移 1px，资源卡可以到 4px。路径带自己带一层更深的阴影，不跟白卡片共用。

**The Soft Drop Rule.** 阴影只有垂直偏移和长模糊。不用贴边的硬阴影，也不用彩色光晕当装饰。

## Shapes

首屏和外层卡片大约 24px 到 30px。倒计时里的每一条大约 16px。打卡内部的奖励区也是大圆角，边用金色虚线。主按钮和次按钮约 12px，高度约 50px，在首屏里拉满宽度。头像、等级和「领羊币」是全圆。短装饰线也是全圆。实线边是 1px 线色。

## Components

### Buttons

- **Shape:** 首屏里三个动作都拉满卡片宽度，竖着排，间距约 10px。圆角约 12px，高度约 50px，字重 700，14px，文字居中。
- **Primary:** 白字。填充从训练蓝到青，左蓝右青。阴影轻。一屏只有这一枚。
- **Secondary:** 深蓝字，几乎是白的浅底，1px 很淡的边。不要做成蓝青渐变。
- **Quiet action:** 打卡卡底部那条是另一种：奶油白底、训练蓝字、拉满宽度、几乎没有边。它不是第二枚主按钮。
- **Hover / Focus:** 悬停上移 1px。焦点是 3px 的品牌蓝淡环。不用浏览器默认外框。

### Chips

- **领羊币:** 全圆，奶油底，深色字，放在打卡标题行的右侧。不要用训练蓝填满。
- **COUNT:** 全圆，浅蓝底，训练蓝字，放在倒计时标题行的右侧。字距略拉开。
- **等级:** 小胶囊，绿色底，白字，贴在用户名旁边。
- **快捷入口:** 没有底，也没有边，灰色字，两列排开。

### Cards / Containers

三种首页卡片分开写。外层都是大圆角白卡片，边很淡，阴影轻。

### Hero

白底，内容居中。上方一行小字，字距拉开，颜色用备注灰，不放圆点。站名用衬线，颜色是训练蓝这一支，下面一条短的蓝青线。一句黑色粗标签，再一行灰色、字距拉开的范围说明。然后才是拉满宽度的主按钮和两枚次按钮。角落的等宽符号很淡。不使用参考站的站名。

### Check-in

标题行从左到右：卡片标题、一条竖线、圆形头像、两行字（上面是灰色的欢迎，下面是名字加绿色等级胶囊）。右侧是「领羊币」奶油胶囊。

标题下面是一块奶油色内嵌，大圆角，边是金色虚线。内嵌顶部居中一行金色说明。下面三行：每行一个圆角方图标（黄、绿、蓝各一块）加一句说明，句子里的数字用同一行图标的颜色强调。

最下面一条拉满宽度的奶油白按钮，字是训练蓝。这一条表示签到，不要做成蓝青渐变。

### Countdown

外层白卡片。头部分左右：左边是标题和一行灰色副题，右边是 COUNT 胶囊。头和身体用一条淡线分开。

身体是奶油底，里面叠白卡片，每条大圆角、淡边。

- 第一条可以拆成两格。已经过去的一格字更灰，不放大数字。还在预计的一格把数字放进略深一点的浅底里，数字用训练蓝，单位「天」小一号跟在后面。
- 第二条数字用深金，下面一行小的金色 `DAYS LEFT`，再一行灰色说明。
- 第三条同样结构，数字和 `DAYS LEFT` 用训练蓝。

数字用等宽，明显大于标题。不要三行都用同一种蓝。

### Path

整块路径夜底。步骤是一行：编号、标题和一句说明、一个箭头。当前步把底色提亮一点，左内边距增加。右侧预览是更深的一块，圆角 15px。

### Status

评测状态保留文字，并使用通过、待定、错误三组浅底。这三组不出现在首页。

## Do's and Don'ts

### Do:

- **Do** 用场地色 `#e8eef5` 做首页底，卡片用雾面白。
- **Do** 把站名设成衬线、训练蓝，蓝青渐变只留在短线和那一枚拉满宽度的主按钮上。
- **Do** 让倒计时数字使用等宽字体。预计中的主数字用训练蓝，第二组用深金，已经结束的一格不要放大数字。
- **Do** 让打卡卡使用虚线奶油内嵌、彩色小图标和奶油胶囊，而不是另一枚蓝青按钮。
- **Do** 把四段学习路径放进同一块深色，而不是四张并列白卡。

### Don't:

- **Don't** 使用参考站的站名、商标、联系人、二维码、邮箱或公告原文。
- **Don't** 再加第二枚蓝青填充按钮。
- **Don't** 把金色用到主按钮或站名上。
- **Don't** 在窄屏保留漂浮符号和标题渐变；收到白底和一块深色主按钮即可。
