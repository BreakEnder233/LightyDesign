---
name: lighty-design-mcp-skill
description: "帮助 AI 通过 MCP 服务理解、校验与编辑策划表（Design Data）的一套可复用工作流与提示模版。面向没有源码的用户与有源码的维护者。"
---

# MCP 策划表编辑 Skill

## 概述

该 Skill 提供一套明确的流程，帮助 AI 使用 MCP（Model Context Protocol / LightyDesign 的宿主 API）来理解、校验、修改并写回策划表（planning sheet）。Skill 适用于两类用户：

- 本地开发者 / 仓库维护者（有 DesktopHost 与项目代码）
- 远程或第三方用户（没有源码，仅通过 MCP/HTTP API 与文件交互）

目标是让 AI 能安全、可回溯地完成如下任务：读取策划表元数据、解析列/单元格含义、生成编辑建议、应用变更并保证通过 validation checks。

## 何时使用

- 需要通过程序化方式对策划表执行批量修正或结构化变更。
- 需要 AI 协助理解复杂的 header/引用语义并据此生成可靠的写回建议。
- 需要在没有源码的情况下，通过宿主提供的 MCP/HTTP 接口完成编辑。

## 输入与假设

- 已知或可查询的 MCP/宿主接口（健康检查、工作区列表、sheet 元数据、validation schema、save/write 接口）。
- 用户或系统应提供：目标工作区标识、目标 workbook/sheet 名称或 ID、必要的 API 凭证（若需要）。
- 如果缺少任何关键输入，Skill 会提出最小必要澄清问题。

## 输出

- 可审阅的变更建议（逐单元格或逐列说明），包含理由与回退建议。
- 可直接提交到宿主的变更补丁（dry-run 支持）。
- 变更后执行的 validation 报告与差异摘要。

## 工作流（步骤）

1. 收集上下文
   - 确认目标：工作区、workbook、sheet。询问缺失信息。
   - 获取宿主健康状态与版本（`/health` 或等效端点）。
   - 获取 sheet 的 header 元数据与若干示例行。

2. 理解表结构与语义
   - 解析 header：列名、类型、引用、默认值、validation 规则。
   - 若 header 含“引用/枚举/公式”，请求相关引用表或 schema 数据。

3. 生成变更候选项（草案）
   - 基于用户指令（例如“合并列 A 与 B”、“标准化日期格式”、“补全缺失引用”）生成逐项变更清单。
   - 每项候选变更包含：描述、影响范围、示例前/后单元格、风险等级（低/中/高）。

4. 本地验证（dry-run）
   - 使用宿主提供的 validation schema 对草案进行模拟验证，收集错误或警告。
   - 若宿主支持 dry-run 写回或 snapshot，保留该快照作为回退点。

5. 与用户确认
   - 把变更清单与验证结果展示给用户，要求确认或进一步约束（例如只修改满足某条件的行）。

6. 应用變更
   - 在获得确认后，通过 MCP/宿主 API 提交写回（建议先以批量 patch 或事务式接口提交）。
   - 若宿主不支持事务，按可回退顺序分批提交并记录每批结果。

7. 验证与报告
   - 写回完成后再次运行 validation，并生成变更报告摘要（变更行数、失败项、回退建议）。

## 决策点与分支逻辑

- 当 header 语义不确定时：优先请求示例行与相关引用表，而不是盲目修改。
- 当 validation 失败但影响较小时：提示用户选择“忽略特定规则并继续”或“先修复再写回”。
- 当宿主不提供 write 接口时：生成可由用户手工应用的 CSV 补丁与详细步骤。

## 质量标准（完成检查）

- 变更在 dry-run 中无 validation 错误或仅含可接受的警告。
- 变更包含可读的审计记录（who/what/when）或在宿主可追踪的变更日志中有条目。
- 变更后的关键引用（外键、枚举）处于一致状态，且未引入孤立项。

## 为没有代码库的用户提供的降级路径

- Skill 提示所需的最小 API 语义（端点、必需参数、返回结构样例），用户可将其提供给拥有宿主访问权限的人来执行操作。
- 如果只能提供文件（例如 Excel/CSV），Skill 会生成清晰的“手工补丁”说明和带差异的导出文件（CSV/JSON），包含示例行与可导入的格式。

## 示例 prompts（可直接给 AI 使用）

- "读取工作区 `Default` 中 `Items.xlsx` 的 `Weapons` sheet，找出 `rarity` 列中值不在引用表 `Rarity` 中的行，并生成修复建议（优先用 `Common` 替换）。返回 dry-run 验证结果。"

- "在 `Events` sheet 中，将 `start_date` 列标准化为 ISO 日期，并仅修改未来三个月的事件；先给出变更摘要，再执行写回。"

- 面向无源码用户的请求示例：
  - "我有一份 CSV，需要把列 `type` 中的值映射到 `TypeRef` 表。下面是 CSV 的前 10 行，请帮我生成一个可以被宿主 API 接受的批量补丁 JSON。"

## 模板化输出格式

- 变更候选项（JSON）示例：

```
{
  "sheet": "Weapons",
  "changes": [
    {"row": 12, "col": "rarity", "from": "Unk", "to": "Common", "reason": "not in Rarity ref"}
  ]
}
```

- 批量补丁（PATCH）示例：

```
POST /api/sheets/Weapons/patch
{
  "ops": [ {"op":"replace","path":"/rows/12/cols/rarity","value":"Common"} ]
}
```

（以上仅为示例；具体字段名应以宿主 API 定义为准）

## 迭代与审核建议

- 初次运行仅执行 dry-run 并导出差异供人工检查。
- 第二次运行按批量 100 行或更小批次提交，便于在出问题时快速回退。
- 始终保留原始快照或可回退的导出文件（Excel/CSV/JSON）。

## 安全与权限

- 明确记录对宿主的写入权限需求并在请求中提示用户确认。
- 对高风险变更（跨列重构、外键重写）要求二次确认或人工审批。

## 交付物（Skill 文件）包含

- 此 `SKILL.md`（工作流、示例、模板）
- 快速上手示例 prompts

---
## 快速上手（给用户的最小步骤）

1. 提供目标位置：工作区/文件/Sheet 名称或样例 CSV。
2. 说明要做的变更（示例 prompts 在上文）。
3. 若可用，提供宿主 API 的访问端点与凭证（可选）。

示例快速命令式提示：

"使用 MCP API：`/api/sheets/{name}/schema` 与 `/api/sheets/{name}/rows?limit=10`，读取 `Events` sheet，标准化 `start_date` 列为 ISO 格式，对未来 90 天的事件生效。返回 dry-run 报告并列出要写回的前 20 项。"

---
## 备注

本 Skill 假定宿主遵循常见的 REST 风格 API 或 MCP 抽象；如遇专有协议，优先请求接口文档样例并在开始前确认。若需要，我可以基于你提供的宿主 API 文档为你生成更精确的 patch 模板与示例调用代码（PowerShell / curl / JavaScript）。
