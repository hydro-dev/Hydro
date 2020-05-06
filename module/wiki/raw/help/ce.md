# Compile Error

可能有以下情况：

- 递交时选错了编程语言
- Java 的主类名没有使用 "Main"
- 对于 C/C++：见下
- 一般性的编译错误

<blockquote class="warn">
    对 C/C++ 选手的特别提醒：
    <ul>
        <li>1. __int64 在 GNU C++ 中应写成 long long 类型</li>
        <li>2. main() 返回值必须定义为 int ，而不是 void</li>
        <li>3. for 语句中的指标变量 i 将会在如"for (int i = 0...) {...}"语句之后变为无效</li>
        <li>4. itoa 不是一个通用 ANSI 函数（标准 C/C++ 中无此函数）</li>
        <li>5. printf 中使用 %lf 格式是不正确的</li>
    </ul>
</blockquote>
