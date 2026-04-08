# Office Claw 去猫化整改方案

> 目标：Office Claw 面向终端用户时，不体现 Cat Cafe 的猫猫元素。  
> 替换对照来源：`cat-config.json`  
> 关联 PR：#218（skills 层去猫化 + 裁剪，已对齐命名规范）  
> 日期：2026-04-07  
> MCP 调用层暂不动。

---

## 术语对照表

与 PR #218 保持一致的命名规范：

| 旧术语 | → 系统提示词（LLM-facing） | → 前端 UI（用户-facing） | 说明 |
|--------|--------------------------|------------------------|------|
| 猫猫 / 猫 | agent | 智能体 | PR #218 在 skill 提示词中统一用 `agent` |
| AI 猫猫 | AI assistant | AI 助手 | 身份标识 |
| 铲屎官 / CVO | 用户 | 用户 | PR #218 已统一 |
| 猫粮 | 不可用 | 配额 | 资源隐喻 |
| 喵约 | 公约 | — | Magic Word |
| 🐾 | 删除 | 删除或换通用图标 | 签名/标识 |
| ᓚᘏᗢ | — | 删除 | ASCII 猫脸 |
| cross-cat-handoff | cross-agent-handoff | — | PR #218 已重命名 |
| 多猫 | 多 agent | 多智能体 | PR #218 规范 |

### 角色对照（cat-config.json → 旧 CAT_CONFIGS）

| cat-config.json id | displayName | nickname | 替换旧角色 |
|-------------------|-------------|----------|-----------|
| office | 办公智能体 | 小九 | 布偶猫/宪宪 (opus) |
| assistant | 通用智能体 | 小理 | 缅因猫/砚砚 (codex) |
| agentteams | 编码智能体 | 小码 | 暹罗猫/烁烁 (gemini) |

---

## Phase A：系统提示词整改

整改范围：后端注入给 LLM 的 system prompt，以及相关配置默认值。
命名规范对齐 PR #218：提示词中用 `agent`，不用 `智能体`。

### A1. SystemPromptBuilder.ts

文件：`packages/api/src/domains/cats/services/context/SystemPromptBuilder.ts`

#### A1.1 身份注入（buildStaticIdentity）

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 1 | 339 | `你是 ${nameLabel}，由 ${providerLabel} 提供的 AI 猫猫。` | `你是 ${nameLabel}，由 ${providerLabel} 提供的 AI assistant。` |
| 2 | 340 | `昵称 "${config.nickname}" 的由来见 docs/stories/cat-names/。` | **删除整行** |
| 3 | 357 | `格式：另起一行行首写 @猫名（行中无效，多猫各占一行）` | `格式：另起一行行首写 @名称（行中无效，多名称各占一行）` |
| 4 | 380 | `${ccName}（铲屎官/CVO）。重要决策由${ccName}拍板。` | `${ccName}（用户/CVO）。重要决策由${ccName}拍板。` |

#### A1.2 队友名册（buildTeammateRoster）

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 5 | 300 | `'## 队友名册'` + `'| 猫猫 | @mention | 擅长 | 注意 |'` | `'## 队友名册'` + `'| Agent | @mention | 擅长 | 注意 |'` |

#### A1.3 治理摘要（GOVERNANCE_L0_DIGEST）

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 6 | 227 | `P2自主跑完SOP不每步问铲屎官` | `P2自主跑完SOP不每步问用户` |
| 7 | 228 | `W1猫是Agent不是API` | `W1 Agent不是API` |
| 8 | 228 | `W4不随地大小便（文件放对目录）` | `W4文件放对目录` |
| 9 | 229 | `不冒充其他猫` | `不冒充其他 agent` |
| 10 | 229 | `commit必须带签名[昵称/模型🐾]（如[宪宪/Opus-46🐾]）` | `commit必须带签名[名称/模型]（如[小九/GPT-54]）` |
| 11 | 235 | `Magic Words（铲屎官对你说以下词=手动拉闸` | `Magic Words（用户对你说以下词=手动拉闸` |
| 12 | 238 | `「喵约」= 你忘了我们的约定` | `「公约」= 你忘了我们的约定` |
| 13 | 239 | `等铲屎官指示` | `等用户指示` |

#### A1.4 工作流触发器（WORKFLOW_TRIGGERS）— 必须改/删

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 14 | 243-275 | 整个 `WORKFLOW_TRIGGERS` 常量，硬编码 ragdoll/maine-coon/siamese 三个 key，内容含 `@缅因猫` `@布偶猫` `@暹罗猫` | **删除整个常量**，或重写为动态读取 |

**⚠️ 不能暂缓**（Review P1-1）：L369 `WORKFLOW_TRIGGERS[config.breedId ?? ''] ?? WORKFLOW_TRIGGERS[catId as string]` 有 fallback 路径。当 catRegistry 降级到 `CAT_CONFIGS` 静态默认值时，`config.breedId` 为 `'ragdoll'` 等，**会命中**，猫文案将注入 system prompt。

**PR #218 关联**：PR #218 删除了 20 个 skills（request-review, receive-review, quality-gate 等），WORKFLOW_TRIGGERS 中引用的 `@缅因猫 请 review` 等工作流已失效。**建议直接删除整个 `WORKFLOW_TRIGGERS` 常量及 L368-372 的注入逻辑**。

#### A1.5 Reviewer 区（buildReviewerSection）

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 15 | 623 | `没猫粮` | `不可用` |
| 16 | 638 | `以下同家族猫可作为 fallback` | `以下同家族 agent 可作为 fallback` |
| 17 | 655 | `你当前可以找以下猫 review` | `你当前可以找以下 agent review` |
| 18 | 661 | `以下猫当前不可用` | `以下 agent 当前不可用` |

#### A1.6 调用上下文（buildInvocationContext）

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 19 | 439 | `你是第 N/M 只被召唤的猫，请注意前面猫的回复。` | `你是第 N/M 个被调用的 agent，请注意前面 agent 的回复。` |
| 20 | 526 | `铲屎官正在语音陪伴模式` | `用户正在语音陪伴模式` |
| 21 | 528 | `语音才是给铲屎官耳朵的输出` | `语音才是给用户耳朵的输出` |

#### A1.7 MCP 工具文档（MCP_TOOLS_SECTION）

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 22 | 212 | `并行拉 1-3 只猫` | `并行拉 1-3 个 agent` |

#### A1.8 Bootcamp 注入残留（Review P1-2）

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 22b | 542 | `→ Load bootcamp-guide skill and act per current phase.` | 删除或改为 `→ Act per current bootcamp phase.`（`bootcamp-guide` skill 已被 PR #218 删除） |

#### A1.9 MCP_TOOLS_SECTION 已删除 skill 引用（Review P1-2 补充）

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 22c | 214 | `plan→writing-plans，失败测试→tdd，对比→collaborative-thinking` | 去掉 `writing-plans` 和 `tdd`（已被 PR #218 删除），仅保留 `collaborative-thinking` |

#### A1.10 代码注释（低优，不影响运行时输出）

| 行号 | 内容 | 处理 |
|------|------|------|
| 65 | `告示牌哲学：猫看了自己决定行动` | 注释→ `agent 看了自己决定行动` |
| 74 | `铲屎官 links a Signal article` | 注释→ `用户 links...` |
| 324 | `铲屎官 reference` | 注释→ `用户 reference` |
| 374 | `// 铲屎官 reference` | 同上 |
| 399 | `// MCP tools and 铲屎官 reference` | 同上 |

---

### A1-ext. ContextAssembler.ts（Review P1-3 补充）

文件：`packages/api/src/domains/cats/services/context/ContextAssembler.ts`

此文件组装对话历史注入 LLM prompt。用户消息的发送者标签直接写入模型上下文。

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 40 | 43 | `if (catId === null) return '铲屎官';` | `if (catId === null) return '用户';` |

**影响**：LLM 看到的历史消息格式为 `[HH:MM 铲屎官] 内容`，改后为 `[HH:MM 用户] 内容`。

---

### A2. CAT_CONFIGS 默认值

文件：`packages/shared/src/types/cat.ts` 行 127-199

当前硬编码 opus/codex/gemini/jiuwenclaw 四套。运行时 catRegistry 从 cat-config.json 覆盖，但前端直接 import `CAT_CONFIGS` 作为 fallback，**必须同步改**。

| # | 改动 |
|---|------|
| 23 | `opus` → `name/displayName` 改为 `'办公智能体'`，`nickname` 改为 `'小九'`，`mentionPatterns` 去掉猫品种名（`@布偶猫` `@宪宪` 等），`roleDescription/personality` 对齐 cat-config.json 的 office |
| 24 | `codex` → 同上，对齐 cat-config.json 的 assistant（小理） |
| 25 | `gemini` → 同上，对齐 cat-config.json 的 agentteams（小码） |
| 26 | `jiuwenclaw` → cat-config.json 中已无此 id，评估是否删除 |

**⚠️ ID 兼容策略（Review P2）**：`CAT_CONFIGS` 的 key（opus/codex/gemini）是 catId，被全链路引用（路由、mention 解析、消息存储、Redis key）。有两种策略需决策：

| 策略 | 做法 | 风险 |
|------|------|------|
| **A: 保留旧 key，改内容** | key 仍为 opus/codex/gemini，只改 name/displayName/nickname 等字段 | 无路由/存储回归；但 cat-config.json 的 id 是 office/assistant/agentteams，两套 id 共存 |
| **B: 改 key 对齐 cat-config.json** | key 改为 office/assistant/agentteams | 需排查所有硬编码 catId 的地方（路由、Redis、mention 正则、消息 store），**回归风险高** |

**建议**：采用策略 A（保留旧 key，改内容），运行时 catRegistry 从 cat-config.json 加载时已经用新 id（office/assistant/agentteams），`CAT_CONFIGS` 仅作为前端 fallback，改内容不改 key 最安全。

---

### A3. Bootcamp 数据

文件：`packages/api/src/domains/cats/services/bootcamp/bootcamp-blocks.ts`

**可见性**：入口已被 `SHOW_BOOTCAMP_ENTRY = false` 关闭。  
**PR #218 关联**：`bootcamp-guide` skill 已被 PR #218 删除，此文件的数据也应同步清理。

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 27 | 32 | `选一只猫猫当你的主引导！` | `选一个智能体当你的主引导！` |
| 28 | 33 | `其他猫猫也会在需要时登场帮忙` | `其他智能体也会在需要时协助` |
| 29 | 38 | `宪宪 (布偶猫)` | `小九 (办公智能体)` |
| 30 | 40 | `选择你的引导猫` | `选择你的引导智能体` |
| 31 | 44 | `砚砚 (缅因猫)` | `小理 (通用智能体)` |
| 32 | 50 | `烁烁 (暹罗猫)` | `小码 (编码智能体)` |
| 33 | 58 | `我选 {selection} 当我的引导猫！` | `我选 {selection} 当我的引导！` |
| 34 | 37,43,49 | `icon: 'cat'` | `icon: 'bot'` |
| 35 | 72-110 | 任务名 `猫猫盲盒/猫猫星座/...` | 去掉"猫猫"前缀 |

**优先级**：低（入口已关闭 + skill 已删除），但建议同步清理。

---

### A4. 播客生成器

文件：`packages/api/src/domains/signals/services/podcast-generator.ts`

| # | 行号 | 当前 | → 改为 |
|---|------|------|--------|
| 36 | 81 | `说话人: 宪宪（主持，布偶猫）和 砚砚（嘉宾，缅因猫）` | 动态读取 cat-config.json 前两个 agent 的 nickname + displayName |
| 37 | 82 | `像两只猫在茶几旁讨论文章` | `像两位同事在茶几旁讨论文章` |

---

### A5. 外发消息层（Connector）

移除所有外发消息中的 🐱 emoji 前缀。

| # | 文件 | 改动 |
|---|------|------|
| 40 | `StreamingOutboundHook.ts` | `[displayName🐱]` → `[displayName]` |
| 41 | `OutboundDeliveryHook.ts` | 删除 `catEmoji = '🐱'`，前缀去 emoji，fallback `'Cat'` → `'Agent'` |
| 42 | `ConnectorMessageFormatter.ts` | 删除 `catEmoji` 字段和 FormatInput 接口成员，header 直接用 displayName，注释 `🐱 布偶猫/宪宪` → `办公智能体` |
| 43 | `FeishuAdapter.ts:685` | `🐱 回复中...` → `回复中...` |
| 44 | `DingTalkAdapter.ts:221` | `` `🐱 ${catDisplayName}` `` → `catDisplayName` |
| 45 | `telegram-html-formatter.ts:39` | `[catDisplayName🐱]` → `[catDisplayName]` |
| 46 | `feishu-card-formatter.ts:58` | `[catDisplayName🐱]` → `[catDisplayName]` |

### A6. 信号日报 & 推送通知

| # | 文件 | 改动 |
|---|------|------|
| 47 | `in-app-notification.ts` | `🐱 Clowder AI 信号日报` → `Clowder AI 信号日报`（2处） |
| 48 | `daily-digest.ts` | 同上（5处：subject, html, text, renderEmptyHtml, renderEmptyText） |
| 49 | `push.ts:305` | `🐱 猫猫测试推送` → `测试推送` |

### A7. 用户可见错误/提示文案

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| 50 | `messages.ts:581` | `猫猫正在忙` | `智能体正在忙` |
| 51 | `messages.ts:866` | `猫猫消息保存失败` | `消息保存失败` |
| 52 | `messages.ts:902` | `猫猫已处理，请打开会话查看详情` | `已处理，请打开会话查看详情` |
| 53 | `messages.ts:982` | `猫猫出错了` | `处理出错` |
| 54 | `threads.ts:508-509` | `猫猫正在工作中` / `请等待猫猫完成当前任务后再删除对话` | `智能体正在工作中` / `请等待智能体完成当前任务后再删除对话` |

### A8. 环境变量注册表（设置面板可见）

文件：`packages/api/src/config/env-registry.ts`

| # | 行 | 当前 | → 改为 |
|---|-----|------|--------|
| 55 | 57 | `猫猫预算` | `预算` |
| 56 | 61 | `缅因猫 (Codex)` | `Codex` |
| 57 | 63 | `暹罗猫 (Gemini)` | `Gemini` |
| 58 | 266 | `布偶猫 prompt 上限` | `Claude prompt 上限` |
| 59 | 274 | `缅因猫 prompt 上限` | `Codex prompt 上限` |
| 60 | 282 | `暹罗猫 prompt 上限` | `Gemini prompt 上限` |
| 61 | 298 | `A2A 猫猫互调最大深度` | `A2A 智能体互调最大深度` |
| 62 | 329 | `猫猫模板文件路径` | `智能体模板文件路径` |
| 63 | 560 | `缅因猫沙箱模式` | `Codex 沙箱模式` |
| 64 | 567 | `缅因猫审批策略` | `Codex 审批策略` |
| 65 | 574 | `缅因猫认证方式` | `Codex 认证方式` |
| 66 | 594 | `暹罗猫适配器` | `Gemini 适配器` |
| 67 | 797 | `不是猫猫自己的 provider profile` | `不是智能体自己的 provider profile` |

### A9. 排行榜 & 成就

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| 68 | `achievement-defs.ts` | `开始猫猫训练营` | `开始训练营` |
| 69 | `achievement-defs.ts` | `完成猫猫训练营全流程` | `完成训练营全流程` |
| 70 | `achievement-defs.ts` | `话痨猫猫` | `话痨达人` |
| 71 | `achievement-defs.ts` | `在猫猫杀中获得 MVP` | `获得游戏 MVP` |
| 72 | `achievement-defs.ts` | CVO 等级：实习猫猫/高级工程猫/技术专家猫/首席铲码官 | 实习生/高级工程师/技术专家/首席执行官 |
| 73 | `silly-stats.ts:48` | `铲屎官发飙次数` | `用户发飙次数` |

### A10. 定时任务 & Review 路由

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| 74 | `reminder.ts` | `按设定时间唤醒猫猫处理提醒（猫猫会根据内容自主行动）` | `按设定时间唤醒智能体处理提醒` |
| 75 | `reminder.ts` | `唤醒哪只猫处理（默认当前注册的猫）` | `唤醒哪个智能体处理（默认当前注册的智能体）` |
| 76 | `ReviewRouter.ts:294` | `通知铲屎官确认合入` | `通知用户确认合入` |
| 77 | `GithubReviewMailParser.ts` | 注释更新（regex 保留兼容历史 PR） |

### A11. 邮件解析器（部分改）

文件：`packages/api/src/infrastructure/email/GithubReviewMailParser.ts`

- 注释从 `Extract cat name` → `Extract agent name`，标注 `legacy format`
- **CAT_TAG_REGEX 保留不改**（需匹配历史 PR 标题中的 `🐾` 签名）

### A12. Governance Pack

文件：`packages/api/src/config/governance/governance-pack.ts`

治理块内容会通过 `governance-bootstrap.ts` 的 `writeManagedBlock()` 方法自动注入到 CLAUDE.md / AGENTS.md / GEMINI.md 中。agent 启动时读这些文件作为上下文，因此 **"Cat Cafe" 会被 agent 识别并暴露给用户**。

#### Sentinel 标记改名

| 当前 | → 改为 | 说明 |
|------|--------|------|
| `<!-- CAT-CAFE-GOVERNANCE-START -->` | `<!-- CLOWDER-GOVERNANCE-START -->` | 匹配产品名 Clowder AI |
| `<!-- CAT-CAFE-GOVERNANCE-END -->` | `<!-- CLOWDER-GOVERNANCE-END -->` | 同上 |

**Sync 逻辑影响**：`governance-bootstrap.ts` 通过 `import { MANAGED_BLOCK_START, MANAGED_BLOCK_END }` 引用常量，改 `governance-pack.ts` 的值即可自动跟随，**不需要改 sync 代码本身**。

**但必须同步更新已有文件中的旧标记**（否则下次 sync 找不到旧标记，会追加出重复块）：
- `CLAUDE.md`（2 处）
- `AGENTS.md`（2 处）
- `GEMINI.md`（2 处）

#### 文案改动

| # | 行 | 当前 | → 改为 |
|---|-----|------|--------|
| 78 | 15-16 | `MANAGED_BLOCK_START/END` 常量值 | `<!-- CLOWDER-GOVERNANCE-START/END -->` |
| 79 | 18 | `## Cat Cafe Governance Rules (Auto-managed)` | `## Governance Rules (Auto-managed)` |
| 80 | 22 | `Cat Cafe's production Redis` | `production Redis` |
| 81 | 24 | `Never impersonate another cat` | `Never impersonate another agent` |

#### 测试文件同步

| 文件 | 改动 |
|------|------|
| `test/governance/governance-bootstrap.test.js` | 更新 expected marker 字符串 |
| `test/governance/governance-confirm.test.js` | 同上 |
| `test/governance/governance-integration.test.js` | 同上 |
| `test/governance/governance-pack.test.js` | 同上 |

---

### A-legacy. PR #218 带来的 Skill 层影响

PR #218 已完成：
- **删除** 20 个 cat-cafe-specific skills（bootcamp-guide, debugging, tdd, worktree 等）
- **保留并去猫化** 4 个协作核心 skills：`collaborative-thinking`, `cross-agent-handoff`, `rich-messaging`, `self-evolution`
- **重命名** `cross-cat-handoff` → `cross-agent-handoff`

**系统提示词需同步**：
| # | 位置 | 影响 | 状态 |
|---|------|------|------|
| 38 | `WORKFLOW_TRIGGERS` (L243-275) | 引用了 `@缅因猫 请 review` 等，依赖已删除的 skills 工作流 | ✅ 已由 PR #218 删除 |
| 39 | `MCP_TOOLS_SECTION` (L214) | `cat_cafe_list_skills/cat_cafe_load_skill` 说明中引用已删除 skill 的映射 | ✅ de-catting 时已精简，仅保留 `对比→collaborative-thinking` |
| 40 | `invoke-single-cat.ts` (L942-944) | ACP runtime skill hint 仍引用 `writing-plans`、`tdd`、`worktree` 三个已删除 skill 的映射 | 🔧 待修复 |

### A13. ACP Runtime Skill Hint 清理

文件：`packages/api/src/domains/cats/services/agents/invocation/invoke-single-cat.ts`

PR #218 删除了 `writing-plans`、`tdd`、`worktree` 三个 skill，但 L942-944 的 `acpRuntimeSkillHint` 仍包含这些 skill 的意图映射。ACP agent 按此映射调用 `cat_cafe_list_skills` 会返回空结果，白费一轮工具调用。

#### 改动

| 当前 | → 改为 |
|------|--------|
| `Map: implementation plan -> writing-plans; failed tests/... -> tdd; compare/recommend/decision -> collaborative-thinking; branch isolation -> worktree.` | `Map: compare/recommend/decision -> collaborative-thinking; structured handoff -> cross-agent-handoff.` |
| 注释 `planning/TDD/collab/worktree requests` | `compare/handoff requests` |

---

## Phase B：前端整改清单

> 以下仅列出位置和内容，**由前端同学执行**。  
> 前端用户可见文案中统一用「智能体」（中文），不用 `agent`。

### B1. 用户直接可见的文案（P0 — 必改）

| # | 文件 | 当前文案 | → 改为 |
|---|------|---------|--------|
| F01 | `components/ThreadCatStatus.tsx` | `猫猫 @ 了你` | `智能体 @ 了你` |
| F02 | `components/ThreadCatStatus.tsx` | `ᓚᘏᗢ` ASCII 猫脸动画 | 删除或换通用图标 |
| F03 | `components/PushSettingsPanel.tsx` | `猫猫回复、权限请求等会推送到系统通知栏` | `智能体回复、权限请求等会推送到系统通知栏` |
| F04 | `components/PushSettingsPanel.tsx` | `猫猫消息会推送到通知栏` | `智能体消息会推送到通知栏` |
| F05 | `components/PushSettingsPanel.tsx` | `点击开启接收猫猫推送` | `点击开启接收智能体推送` |
| F06 | `components/ChatInput.tsx` | `请至少选一只猫猫` | `请至少选一个智能体` |
| F07 | `components/ChatInputActionButton.tsx` | `排队发送 — 猫猫忙完后处理` | `排队发送 — 智能体忙完后处理` |
| F08 | `components/ChatInputActionButton.tsx` | `强制发送 — 中断当前猫猫` | `强制发送 — 中断当前智能体` |
| F09 | `components/ParallelStatusBar.tsx` | `停止所有猫猫` | `停止所有智能体` |
| F10 | `components/ChatInputMenus.tsx` | `↓ 还有更多猫猫` | `↓ 还有更多智能体` |
| F11 | `components/BindNewSessionSection.tsx` | `选择猫猫...` | `选择智能体...` |
| F12 | `components/VoteConfigModal.tsx` | `投票猫猫` | `投票智能体` |
| F13 | `components/RightStatusPanel.tsx` | `猫猫状态` | `智能体状态` |
| F14 | `components/MobileStatusSheet.tsx` | `猫猫状态` / `猫猫消息` | `智能体状态` / `智能体消息` |
| F15 | `components/EvidencePanel.tsx` | `喵... 翻遍了猫砂盆也没找到相关证据` | `暂未找到相关证据` |
| F16 | `components/ChatEmptyState.tsx` | `第一次来？开始猫猫训练营` | `第一次来？开始新手引导` |
| F17 | `components/BootcampListModal.tsx` | `🎓 猫猫训练营` | `🎓 新手训练营` |
| F18 | `hooks/useAuthorization.ts` | `🔐 猫猫需要权限` | `🔐 智能体需要权限` |
| F19 | `stores/chatStore.ts` | `猫猫` fallback / `${catName} @ 了你` | fallback → `智能体` |
| F20 | `components/mission-control/SuggestionDrawer.tsx` | `等待铲屎官决策` | `等待用户决策` |
| F21 | `components/ThreadSidebar/DirectoryPickerModal.tsx` | `收起猫猫` / `选猫猫` | `收起列表` / `选智能体` |
| F22 | `components/ThreadSidebar/CatSelector.tsx` | `默认猫猫 (可选)` | `默认智能体 (可选)` |
| F23 | `components/ThreadSidebar/ThreadCatSettings.tsx` | `设置默认猫猫` | `设置默认智能体` |
| F24 | `components/PlanBoardPanel.tsx` | `猫猫祟祟` | `任务看板` |

### B2. Hub 设置面板文案（P1）

| # | 文件 | 当前文案 | → 改为 |
|---|------|---------|--------|
| F25 | `components/HubRoutingPolicyTab.tsx` | `默认是猫猫自治路由` | `默认是智能体自治路由` |
| F26 | `components/HubRoutingPolicyTab.tsx` | `比如预算/猫粮` | `比如预算/配额` |
| F27 | `components/HubEnvFilesTab.tsx` | `猫猫模板（只读 seed）` | `智能体模板（只读 seed）` |
| F28 | `components/HubEnvFilesTab.tsx` | `布偶猫项目指引` / `缅因猫项目指引` / `暹罗猫项目指引` | 用 cat-config.json displayName 替换 |
| F29 | `components/hub-cat-editor.sections.tsx` | `可选，铲屎官给的昵称` | `可选，用户自定义昵称` |
| F30 | `components/HubLeaderboardTab.tsx` | `CVO 能力等级 🐾` | `CVO 能力等级`（去掉🐾） |
| F31 | `components/HubLeaderboardTab.tsx` | `夜猫子` | `夜间活跃` |
| F32 | `components/AuthorizationCard.tsx` | `布偶猫` / `缅因猫` / `暹罗猫` / `狸花猫` | 用 cat-config.json displayName 替换 |

### B3. 游戏/互动模块文案（P1）

| # | 文件 | 当前文案 | → 改为 |
|---|------|---------|--------|
| F33 | `components/game/GameLobby.tsx` | `选择参赛猫猫（点击添加）` | `选择参赛智能体（点击添加）` |
| F34 | `components/game/GameLobby.tsx` | `选择绑定猫猫` | `选择绑定智能体` |
| F35 | `components/game/GameLobby.tsx` | `请选择一只猫猫绑定视角` | `请选择一个智能体绑定视角` |

### B4. 图标/Logo 组件（P1）

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F36 | `components/icons/PawIcon.tsx` | 🐾爪印 SVG 图标 | 替换为通用图标 |
| F37 | `components/icons/CatCafeLogo.tsx` | 注释 `三猫流光渐变：布偶蓝 → 缅因金 → 暹罗紫` | 更新注释 |

### B5. 语音输入上下文（P1）

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F38 | `hooks/useVoiceInput.ts` | 语音纠错上下文含 `布偶猫（Claude Opus）` `缅因猫（Codex）` | 用 cat-config.json displayName 替换 |

### B6. Review P1-4 补充遗漏项（P0）

| # | 文件 | 当前文案 | → 改为 |
|---|------|---------|--------|
| F41 | `worker/index.ts:32` | `猫猫来信`（push 解析失败 fallback） | `消息通知` |
| F42 | `worker/index.ts:49` | `猫猫来信`（通知标题 fallback） | `消息通知` |
| F43 | `hooks/useChatCommands.ts:84` | `猫猫配置`（/config 命令输出） | `智能体配置` |
| F44 | `hooks/useChatCommands.ts:93` | `A2A 猫猫互调`（/config 命令输出） | `A2A 智能体协作` |
| F45 | `hooks/useSocket-background-system-info.ts:297` | `猫猫`（proposedBy fallback） | `智能体` |

### B7. 测试文件（随主代码同步改）

| # | 范围 | 说明 |
|---|------|------|
| F39 | `components/__tests__/*.test.ts(x)` ~20 文件 | fixture 中的猫名/猫文案，随对应组件同步更新 |
| F40 | `utils/__tests__/transcription-corrector.test.ts` | 语音纠错测试用例 `免因猫→缅因猫` 等，更新为新名称 |

---

## 整改统计

| Phase | 文件数 | 改动点 | 优先级 | 状态 |
|-------|--------|--------|--------|------|
| A1-A4（系统提示词 + 配置 + bootcamp + 播客） | 5 文件 | 42 处 | P0 | ✅ 已执行 |
| A5-A11（connector + 通知 + 错误文案 + 设置 + 成就 + 定时任务 + review） | 18 文件 | 35 处 | P0 | ✅ 已执行 |
| A12（governance-pack + sentinel + 3 md） | 4 文件 | 10 处 | P0 | ✅ 已执行 |
| B（前端） | ~33 文件 | 45 处 | P0-P1 | 📋 已列出，由前端执行 |
| C（运行时数据清理） | 见下方 | — | P0 | 📋 部署时执行 |
| 测试同步 | ~20 文件 | 跟随主代码 | P1 | 📋 待同步 |
| 注释清理 | ~30 处 | 不影响用户 | P2 | — |

## Review 记录

缅因猫 Review 于 2026-04-07，发现 4 个 P1 + 1 个 P2，已全部纳入：
- P1-1: WORKFLOW_TRIGGERS fallback 路径 → A1.4 改为"必须改/删"
- P1-2: bootcamp-guide 注入残留 + MCP skill 引用 → 新增 A1.8, A1.9
- P1-3: ContextAssembler 铲屎官标签 → 新增 A1-ext
- P1-4: 前端遗漏（worker/commands/socket）→ 新增 B6
- P2: CAT_CONFIGS id 兼容策略 → A2 补充决策表

---

## Phase C：运行时数据清理（部署时执行）

代码层面已无 Cat Cafe / 猫猫 残留，但运行时存储的历史数据仍包含旧内容。
以下操作需在**部署机器**上手动执行。

### C1. RelayClawAgentService channelId fallback

文件：`packages/api/src/domains/cats/services/agents/providers/RelayClawAgentService.ts:103`

```typescript
this.config.channelId ?? 'catcafe'   // ← fallback 默认值
```

- `channelId` 作为 session 目录前缀，生成 `catcafe_<timestamp>_<uuid>/` 格式的路径
- 如 `.cat-cafe/relayclaw/office/.jiuwenclaw/agent/sessions/catcafe_19d67cc4ada_.../history.json`
- **影响**：jiuwenclaw 的 session 目录名带 "catcafe" 前缀
- **建议**：改 fallback 为 `'clowder'`，或在 cat-config.json 中显式配置 `channelId`
- **注意**：改后新 session 使用新前缀，旧 session 目录不会自动迁移

### C2. jiuwenclaw 记忆文件

路径：部署机器 `~/.jiuwenclaw/agent/memory/`

- jiuwenclaw 有独立的记忆系统（`memory_tools.py`），记忆文件存储在磁盘上
- 历史对话中 agent 写入的记忆包含 "Cat Cafe" / 猫猫 等旧内容
- **影响**：agent 被问到"我们是什么"时，会调 `read_memory` 读取旧记忆，向用户暴露 "Cat Cafe"
- **修复**：清理记忆目录中的旧文件
  ```bash
  # 查看记忆内容
  ls ~/.jiuwenclaw/agent/memory/
  
  # 清除自定义记忆（保留空模板）
  rm -f ~/.jiuwenclaw/agent/memory/memory/*.md
  
  # 重置 USER.md / MEMORY.md 为空模板（可选）
  ```
- **验证**：重启服务后，新对话中 agent 应基于更新后的 system prompt 重建记忆

### C3. Redis 会话数据（可选）

端口 6388（Office Claw 实例的 Redis）

- 历史消息记录中可能包含旧的猫猫文本（如 agent 之前回复的 "我是布偶猫🐱宪宪"）
- **不建议清除**：会丢失全部对话历史
- **自然过渡**：新对话不再产生猫相关内容，旧消息会随时间沉没

---

## 验证方案

### Phase A 验证
1. 启动服务，发送消息给任一智能体
2. 检查 API 日志中注入的 system prompt，确认无 `猫猫|布偶|缅因|暹罗|铲屎官|🐾|喵`
3. 检查 agent 回复中不自称猫或用猫相关语气

### Phase B 验证
1. 全局搜索前端 build 产物关键词：`猫猫|猫|喵|铲屎官|🐾|布偶|缅因|暹罗`
2. 逐页面检查 UI 文案（对照上表 F01-F38）
3. 运行前端测试确认无 regression
