import DomainModel from './model/domain';
import ProblemModel from './model/problem';
import RecordModel from './model/record';

const bulletin = `\
### 欢迎来到 Hydro ！  

当你看到这行字时，说明 Hydro 的基础功能已经正常运行。  
下一步您应该：

- 在右上角注册一个账号。  
- 回到刚刚的终端，使用 \`hydrooj cli user setSuperAdmin 2\` 将 UID 为 2 的用户设置为超级管理员。  
- 使用 \`pm2 restart hydrooj\` 重启以使管理员更改立刻生效。  
- 前往 “题库” 面板，查看创建的示例题目是否正常工作。  
- 使用超级管理员账号登录，通读 [控制面板 -> 系统设置](/manage/setting) 页面，按需配置。  

如果您需要可以直接导入的题目，可以 [加入 Hydro 用户群](https://jq.qq.com/?_wv=1027&k=pKYrk4yp) 或是 [从 Hydro 题库下载](https://hydro.ac/d/tk/p) 。  
您也可以下载 [一本通编程启蒙](https://hydro.ac/ybtbas.zip) 和 [深入浅出程序设计竞赛（基础篇）](https://hydro.ac/srqc.zip) 题库并按照压缩包内说明导入系统。  
如果您需要题目配置指南，可以 [查看文档](https://hydro.js.org) 或是 [查看配置示例](https://hydro.ac/d/system_test/) 。

当你已经熟悉本系统的操作，可以在 [管理域 > 编辑域资料](/domain/edit) 页面修改这条置顶信息。

### Welcome to Hydro !  

If you see this line, it means Hydro is running normally.  
Next step you should:

- Register a new account.  
- Go back to the terminal, use \`hydrooj cli user setSuperAdmin 2\` to set user with UID 2 as super admin.  
- Use \`pm2 restart hydrooj\` to make the change take effect.  
- Go to “Problems” panel, check whether the example problem is working properly.  
- Use super admin account to login, read the [Control panel -> System settings](/manage/setting) page, configure as needed.

If you want to import problems, you can join [Hydro QQ user group](https://jq.qq.com/?_wv=1027&k=pKYrk4yp) 
or download from [Hydro problem library](https://hydro.ac/d/tk/p) .  
You can also download [Guide to Competitive Programming](https://hydro.ac/ybtbas.zip)
and [In-depth Programming Competition (Basics)](https://hydro.ac/srqc.zip) and follow the instructions
in the zip file to import to the system (Chinese version only).
If you need problem configuration guide, you can [view user manual](https://hydro.js.org) or 
[view examples](https://hydro.ac/d/system_test/) .

This message can be modified in [Domain > Edit information](/domain/edit) page.
`;

const defaultProblem = JSON.stringify({
    en: `\
This is the example A+B problem.
If you didn't see 'No testdata at current' message, it means file storage is working properly.

Just write a program that reads two integers from standard input, and prints their sum to standard output.
Feel free to delete this problem in 'Edit' panel if you don't need this.

Click 'Enter Online Programming Mode' to open the built-in Hydro IDE.
`,
    zh: `\
这是一道简单的 A+B 题目。
如果您没有看到“当前没有测试数据”的消息，说明文件存储功能正常运行。

编写一个程序，从标准输入读取两个整数，并将它们的和输出到标准输出。
如果您不需要这道题目，可以在右侧“编辑”面板中删除它。

点击右侧 “进入在线编程模式” 打开内置的 Hydro IDE。
`,
});

const testdatas = {
    'config.yaml': 'time: 1s\nmemory: 64m\n',
    '1.in': '1 2\n',
    '1.out': '3\n',
    '2.in': '1 1\n',
    '2.out': '2\n',
};

const std = `\
// 这是由 Hydro 自动提交的测试代码，用于测试系统是否正常运行。
// 如果这个提交返回了 Accepted ，则说明一切正常。
// This is a submission by Hydro system, used to test if judge is working properly.
// If this submission returns 'Accepted', it means everything is fine.

#include<iostream>
using namespace std;
int main() {
  int a, b;
  cin >> a >> b;
  cout << a + b << endl;
  return 0;
}
`;

export default async function apply() {
    if (process.env.CI) return;
    await DomainModel.edit('system', { bulletin });
    const docId = await ProblemModel.add('system', 'P1000', 'A+B Problem', defaultProblem, 1, ['系统测试']);
    // This might fail so we are doing it asynchronously.
    Promise.all(
        Object.keys(testdatas).map(
            (i) => ProblemModel.addTestdata('system', docId, i, Buffer.from(testdatas[i])),
        ),
    ).then(() => RecordModel.add('system', docId, 1, 'cc', std, true));
}
