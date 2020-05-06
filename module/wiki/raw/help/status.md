# Judge Status

- <span class="record-status--text pending">Waiting</span> 评测：评测请求正在等待被评测机抓取
- <span class="record-status--text progress">Fetched</span> 评测：评测请求已被评测机抓取，正在准备开始评测
- <span class="record-status--text progress">Compiling</span> 评测：正在编译中
- <span class="record-status--text progress">Judging</span> 评测：编译成功，正在评测中
- <span class="record-status--text pass">Accepted</span> 通过：程序输出完全正确
- <span class="record-status--text fail">Wrong Answer</span> 不通过：程序输出与标准答案不一致（不包括行末空格以及文件末空行）
- <span class="record-status--text fail">Time Exceeded</span> 不通过：程序运行时间超过了题目限制
- <span class="record-status--text fail">Memory Exceeded</span> 不通过：程序运行内存空间超过了题目限制
- <span class="record-status--text fail">Runtime Error</span> 不通过：程序运行时错误（如数组越界、被零除、运算溢出、栈溢出、无效指针等）
- <span class="record-status--text fail">Compile Error</span> 不通过：编译失败
- <span class="record-status--text fail">System Error</span> 错误：系统错误（如果您遇到此问题，请及时在讨论区进行反馈）
- <span class="record-status--text ignored">Canceled</span> 其他：评测被取消
- <span class="record-status--text fail">Unknown Error</span> 其他：未知错误

<blockquote class="note">有“成绩取消”字样则说明管理员手动标记此记录为取消，可能违反了服务条款，比如代码被发现与其他用户的代码十分相似。</blockquote>