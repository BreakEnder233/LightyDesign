# Tests 子系统

## 职责

Tests 子系统对应 tests/LightyDesign.Tests。它负责验证 Core、Generator 以及后续关键协议逻辑的正确性。

## 当前已完成的工作

1. 已创建 xUnit 测试项目骨架。
2. 已加入解决方案。
3. 已建立对 Core 和 Generator 的引用。
4. 已完成基础测试运行验证，当前测试项目可被发现并执行。

## 当前尚未实现的业务能力

1. 表头解析测试。
2. txt 转义与反转义测试。
3. 引用语法解析测试。
4. Generator 输出结构测试。
5. DesktopHost 接口集成测试。

## 当前状态结论

Tests 当前只完成了测试工程本身的接线，还没有覆盖业务协议。随着 Core 和 Generator 开始实现，测试应同步补齐，而不是最后集中补写。
