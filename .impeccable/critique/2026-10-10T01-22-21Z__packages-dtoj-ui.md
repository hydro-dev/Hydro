---
target: packages/dtoj-ui phase-1 static UI
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/workspace/packages/dtoj-ui"
timestamp: 2026-10-10T01-22-21Z
slug: packages-dtoj-ui
closed: true
---
Method: dual-agent (A: bc-94694c3f-d123-5504-bf8b-b096df78708b · B: bc-48d0ee46-e692-5210-9080-f7497a6ae9fd)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | 导航和芯片能标出当前位置，打卡、筛选和等级分翻页不改变示例内容。 |
| 2 | Match System / Real World | 3 | CSP、评测队列等用语符合课堂；首页直接说明商标和联系方式不在这里。 |
| 3 | User Control and Freedom | 2 | 详情页能返回；训练方向点亮后没有「全部」可清掉。 |
| 4 | Consistency and Standards | 2 | 社区帖子是链接卡片，讨论条目长得一样但不能点。评测状态用词和筛选项不一致。 |
| 5 | Error Prevention | 3 | 加入课程已禁用；今日打卡仍是可点的主按钮，点了没有结果。 |
| 6 | Recognition Rather Than Recall | 2 | 学生要记住蓝色芯片不会缩小列表，题库在九项导航之外。 |
| 7 | Flexibility and Efficiency of Use | 2 | 九项导航一次可点开；筛选和横滑不产生更短的列表。 |
| 8 | Aesthetic and Minimalist Design | 2 | 首页各块同一权重。热门课程在全部课程里再出现一次。 |
| 9 | Error Recovery | 2 | 打卡和翻页没有出错提示，也没有变化，只靠灰字说明。 |
| 10 | Help and Documentation | 2 | 限制写在列表后面的灰字里，像实现备注。 |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict

信息架构是这间本机练习场的：九项导航、CSP 到 GESP、羊币、四项活动、七列评测队列。视觉是一套可套到任何目录站的白卡片。品牌「青石练习场」只出现在首页标题。

确定性扫描：`impeccable detect --json packages/dtoj-ui` 退出码 0，结果 `[]`，0 条。检测器没有指出层次、焦点和主次问题，这些只在设计评审里。

浏览器叠层：本机 127.0.0.1:80 拒绝连接，模板要在 Hydro 里渲染，没有注入 detect.js。没有用户可见的叠层。

## Overall Impression

页面能按课堂用语点开，但首页把「今日打卡」做成唯一实心按钮，学习路径却埋在公告下面。最大的机会是让四段路径先被看见，把示例控件收成安静的状态，而不是看起来能提交。

## What's Working

- 九项导航能打开对应页，详情页的 page_name 前缀能保持当前项。
- 第一期要求的区块和字段都在，比赛卡片写了组别、时长、题量、人数、赛制和起止时间。
- 加入课程是禁用的，占位页写明没有库存和结算。

## Priority Issues

### [P0] 首页不能当一节课的起点来扫
学习路径（题库、课程、比赛、复盘）排在倒计时、羊币、四项活动和公告之后，而且和它们共用同一张卡片。
Fix: 把学习路径放到品牌下面，路径卡片更大；倒计时、羊币和活动保持可见但更紧、更浅。
Suggested command: /impeccable layout

### [P0] 今日打卡看起来是第一个动作，却没有结果
它是可聚焦的 primary 按钮。
Fix: 禁用它，去掉 primary，旁边只保留已连续天数的示例说明。
Suggested command: /impeccable polish

### [P1] 筛选和高亮翻页只改外观，说明在列表后面
训练、比赛、社区、讨论和等级分都是这样。
Fix: 把已有的说明放到结果前面，用可读的浅底，不要靠细灰字。训练增加「全部」，方便取消方向高亮。
Suggested command: /impeccable layout

### [P1] 评测队列的状态扫不出来，宽表没有横向滚动
通过、部分分、编译错误、答案错误、运行中都是纯文本。
Fix: 状态保留文字并加浅底色；表格包进横向滚动。
Suggested command: /impeccable typeset

### [P2] 键盘焦点看不见，讨论卡片假装是链接
宿主把 outline 去掉了。讨论条目用了和链接卡片一样的样子。
Fix: focus-visible 描边，芯片至少约 44px 高。讨论条目用静态卡片。示例题库从各页底部能打开，不加第十个导航项。
Suggested command: /impeccable polish

## Persona Red Flags

Jordan：第一句是商标不在这里，今日打卡没有反馈。点了 CSP-J 列表不变。讨论标题像真的故障。
Sam：卡片和芯片没有可见焦点。分类树的当前项没有 aria-current。评测表七列在窄屏会挤出屏幕。
Lin：九页都能打开，但投到教室时先看到倒计时而不是四段路径。离开首页后示例题库不容易再找到。

## Minor Observations

- 两场倒计时都是 86 天，这是示例数据，这次不改数字。
- 社区详情里的代码块对每篇帖子都一样。
- 比赛主推行是标题上方的小标签。
- 页内标题级别在 h1 和裸 h2 之间跳。

## Questions to Consider

- 如果学生只带走一次点击，为什么实心按钮是打卡，而题库、课程、比赛、复盘在公告下面？
- 蓝色芯片必须留着、又不能改变列表时，它应该长得像筛选，还是像一条先读到的说明？
- 品牌只写在首页大标题上。人在评测队列时，怎么知道这是青石练习场？

Questions skipped: 本次任务已经指定接着做 layout、typeset、polish，并写明保留九项导航、示例数据、占位品牌和独立题库路径，不再单独追问。
