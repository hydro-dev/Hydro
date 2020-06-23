# Compilers' Version and Parameters

Hydro使用 [HydroJudger](https://github.com/hydro-dev/HydroJudger) 进行评测，以docker镜像的形式安装至评测机。  
所使用的编译器均为创建镜像时 [debian testing](https://wiki.debian.org/DebianTesting) 分支的最新版。编译参数如下：  

- Free Pascal `fpc -O2 -o/out/foo /in/foo.pas`
- C `gcc -O2 -Wall -std=c99 -o /out/foo /in/foo.c -lm`
- C++ `g++ -O2 -Wall -std=c++11 -o /out/foo /in/foo.cc -lm`
- Java `javac Main.java`
- Python `python foo.py`
- Python 3 `python3 foo.py`
- PHP `php foo.php`
- Rust `rustc -O -o /out/foo /in/foo.rs`
- Haskell `ghc -O -outputdir /tmp -o /out/foo /in/foo.hs`

# Limitations

Hydro 评测机使用进程的CPU时间计算时间消耗，时间的限定为题目中评测点所指定的时间。  
Hydro 评测机使用进程虚拟内存与物理内存总和计算内存空间消耗。内存空间默认限定为256MiB，题目中特别指明的，限定为题目中评测点所指定的内存空间。

# IO

若无特殊说明，Hydro 使用标准输入输出（控制台输入输出，屏幕输入输出，STD I/O）。

# Judge Status

- :::record-pending Waiting::: 评测：评测请求正在等待被评测机抓取
- :::record-progress Fetched::: 评测：评测请求已被评测机抓取，正在准备开始评测
- :::record-progress Compiling::: 评测：正在编译中
- :::record-progress Judging::: 评测：编译成功，正在评测中
- :::record-pass Accepted::: 通过：程序输出完全正确
- :::record-fail Wrong Answer::: 不通过：程序输出与标准答案不一致（不包括行末空格以及文件末空行）
- :::record-fail Time Exceeded::: 不通过：程序运行时间超过了题目限制
- :::record-fail Memory Exceeded::: 不通过：程序运行内存空间超过了题目限制
- :::record-fail Runtime Error::: 不通过：程序运行时错误（如数组越界、被零除、运算溢出、栈溢出、无效指针等）
- :::record-fail Compile Error::: 不通过：编译失败
- :::record-fail System Error::: 错误：系统错误（如果您遇到此问题，请及时在讨论区进行反馈）
- :::record-ignored Canceled::: 其他：评测被取消
- :::record-fail Unknown Error::: 其他：未知错误

:::note 有“成绩取消”字样则说明管理员手动标记此记录为取消，可能违反了服务条款，比如代码被发现与其他用户的代码十分相似。:::

# Compile Error

可能有以下情况：

- 递交时选错了编程语言
- Java 的主类名没有使用 "Main"
- 对于 C/C++：见下
- 一般性的编译错误

:::warn
    对 C/C++ 选手的特别提醒：
    <ul>
        <li>1. __int64 在 GNU C++ 中应写成 long long 类型</li>
        <li>2. main() 返回值必须定义为 int ，而不是 void</li>
        <li>3. for 语句中的指标变量 i 将会在如"for (int i = 0...) {...}"语句之后变为无效</li>
        <li>4. itoa 不是一个通用 ANSI 函数（标准 C/C++ 中无此函数）</li>
        <li>5. printf 中使用 %lf 格式是不正确的</li>
    </ul>
:::

# Training

我们精心挑选了一些题目组成了训练计划。单击导航栏的“训练”即可进入！

# Contest

按照赛制不同，有不同的递交、排名规则。
OI 赛制所有题目均以最后一次递交为准，特别地，请避免编译错误。
OI 赛制排名规则为：总分高的排在前面，总分相等则排名相同。
ACM/ICPC 赛制所有题目递交后立即评测，以是否通过为准。
ACM/ICPC 赛制排名规则为：通过题目数多的排在前面，通过题目数相同的做题耗时（含罚时）少的排在前。
时间与空间限制以题目说明为准，默认限制参见[Limitations](#Limits)。

# Accepted Ratio

通过率的影响极其恶劣，Hydro 不提供也不承认通过率。

# RP

Hydro RP 分为固定 RP 与浮动 RP ，固定 RP 可由活动、比赛等的奖励获得，浮动 RP 由一般性通过题目获得。  
浮动 RP 是一个动态的数值，每个用户在每道题上获得的 RP 都不一样，并且未来也不固定（即浮动之意）。  

:::note 每道题的浮动 RP 由该题通过总人数与该用户通过此题的名次计算得来。:::

# Dataset Format

TODO

# Forgot Password and/or Username

如果您无法登录，请仔细想想，是不是用户名记错了。比如，自己原本想要注册的用户名已经被注册，所以使用了一个带有前和/或后缀的用户名。  
如果您确信您的账号被盗或者忘记了账号和/或密码，请及时[{{ _('Reset Password or Find Username') }}](/lostpass)。
