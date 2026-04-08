---
feature_ids: []
topics: [architecture, acp, provider-profile, configuration, env]
doc_kind: note
created: 2026-03-27
updated: 2026-03-27
---

# ACP 配置说明

> Cat Cafe / Clowder AI 内如何配置 ACP provider、ACP model profile、provider 环境变量，以及如何把 cat 绑定到外部 ACP agent。

## 概述

Clowder 里的 ACP 接入分成三层：

1. **ACP Provider Profile**
   定义如何启动外部 ACP agent 进程，例如 `relay-teams gateway acp stdio` 或 `opencode acp`，并可选附带一组安全过滤后的环境变量。
2. **ACP Model Profile**
   仅在 `clowder_default_profile` 模式下使用，由 Clowder 把模型参数和密钥下发给 ACP agent。
3. **Cat 绑定**
   在 cat catalog 里把某只猫的 `client` 设为 `acp`，并绑定到前面创建的 ACP provider。

这三层都配好之后，前端里 `@cat` 才能真正走到 `ACP session/new -> session/prompt`。

## ACP MCP 与中断恢复

当前 ACP host 集成支持两类 session-scoped MCP 注入方式：

- `mcpCapabilities.stdio`: Clowder 继续按 host-provided stdio MCP server 注入
- `mcpCapabilities.acp`: Clowder 注入 `transport: "acp"` 的 `cat-cafe` server，并在运行期桥接 `mcp/connect`、`mcp/message`、`mcp/disconnect`

对 `relay-teams` 这类显式声明 `mcpCapabilities.acp` 的 ACP agent，推荐把 host MCP 视为首选路径，而不是额外再配一份本地 MCP 配置文件。

中断恢复分两层：

- 普通 follow-up turn: `session/load -> session/prompt`
- 显式恢复被中断 run: `session/load -> session/resume`

Clowder 通过 `resumeCatId` 显式指定“本次消息是恢复哪只猫的中断会话”。该字段会绕过普通 mention 路由，并保持队列隔离，避免把恢复 turn 和普通 follow-up 合并。

当前内置入口：

- 右侧 `Plan Board` 的“继续任务”按钮会自动携带 `resumeCatId`
- 编程式调用可直接 `POST /api/messages` 并附带 `resumeCatId`

对 ACP provider 而言，恢复链路的目标语义是“只继续新的尾巴”，不是重新回放整段已展示输出。因此 host 侧会在 `session/load` 完成后丢弃 replay 的历史 update，再把新的 resume 输出继续流给前端。

## 两种运行模式

### 1. `self_managed`

适合 ACP agent 自己管理模型和密钥的场景，例如 `opencode acp`。

- Clowder 只负责启动 ACP agent 进程
- 模型、base URL、凭据由 agent 自己读取
- 不需要额外创建 ACP Model Profile

推荐示例：

```text
displayName: opencode-acp
kind: acp
command: opencode
args: acp
cwd: /path/to/project
env:
  OPENCODE_DEBUG: "1"
modelAccessMode: self_managed
```

### 2. `clowder_default_profile`

适合 ACP agent 支持 `modelProfileOverride` 的场景，例如 `relay-teams`。

- Clowder 会在 `session/new` 或 `session/load` 时下发模型配置
- 需要先创建 ACP Model Profile
- ACP agent 不需要自己再找 OpenAI / OpenRouter / BigModel 凭据

推荐示例：

```text
displayName: relay-teams
kind: acp
command: relay-teams
args: gateway acp stdio
cwd: /opt/workspace/relay-teams
env:
  ACP_TRACE_STDIO: "1"
  RELAY_TEAMS_LOG_LEVEL: "DEBUG"
modelAccessMode: clowder_default_profile
defaultModelProfileRef: relay-teams
```

## 推荐配置

### relay-teams

先安装 CLI：

```bash
pip install relay-teams
```

如果机器上没有系统 `pip`，可以用等价方式：

```bash
uv tool install relay-teams
```

创建 provider 时推荐使用：

```text
command: relay-teams
args: gateway acp stdio
cwd: /opt/workspace/relay-teams
env:
  ACP_TRACE_STDIO: "1"
  RELAY_TEAMS_LOG_LEVEL: "DEBUG"
modelAccessMode: clowder_default_profile
defaultModelProfileRef: relay-teams
```

说明：

- `command` 直接写 `relay-teams`，不要再依赖 `uv --directory ... run`
- `cwd` 可以保留成 relay-teams 仓库路径，便于本地诊断和读取仓库态说明文件
- `env` 适合放 relay-teams 自己识别的运行时开关，例如 `ACP_TRACE_STDIO=1`
- `defaultModelProfileRef` 要指向一个存在且带密钥的 ACP Model Profile

### opencode

创建 provider 时推荐使用：

```text
command: opencode
args: acp
cwd: /path/to/project
modelAccessMode: self_managed
```

说明：

- `opencode` 走自管模型模式更自然
- 不需要给它配 ACP Model Profile
- Clowder 只负责 ACP 会话，不接管它的 provider / credential 体系

## 在 Hub 里的配置顺序

### A. 创建 ACP Model Profile

仅 `clowder_default_profile` 需要。

最少需要填写：

- `displayName`
- `provider`
- `model`
- `baseUrl`
- `apiKey`

当前 secrets 会分开落盘，不会从普通 GET 接口里直接回显。

### B. 创建 ACP Provider Profile

最少需要填写：

- `displayName`
- `command`
- `args`
- `modelAccessMode`

按需填写：

- `cwd`
- `env`
- `defaultModelProfileRef`

`env` 在 Hub 里按“每行 `KEY=value`”填写。保存后，卡片摘要只展示 key，不回显 value。

推荐示例：

```text
ACP_TRACE_STDIO=1
RELAY_TEAMS_LOG_LEVEL=DEBUG
```

支持空值，例如：

```text
FEATURE_FLAG=
```

这会被解析成 `FEATURE_FLAG=""`。

### ACP Provider 环境变量规则

ACP provider 子进程不会继承一份“完全原样”的宿主环境，而是走一层过滤和覆盖：

- 先复制宿主进程里允许透传的环境变量
- 再把 provider profile 里配置的 `env` 覆盖进去

当前会拒绝覆盖的保留 key / 前缀：

- 固定 key：`DATABASE_URL`、`REDIS_URL`、`GITHUB_TOKEN`、`GITHUB_MCP_PAT`
- 固定前缀：`AWS_`、`CAT_CAFE_`、`DATABASE_`、`GITHUB_`、`POSTGRES_`、`REDIS_`

如果 provider 运行在 `clowder_default_profile` 模式，还会额外拒绝模型凭据相关前缀，避免 ACP provider 通过自定义 env 覆盖 Clowder 下发的模型配置：

- `ANTHROPIC_`
- `DARE_`
- `GEMINI_`
- `GOOGLE_`
- `OPENAI_`
- `OPENROUTER_`

推荐把 `env` 只用于 ACP agent 自己的运行时开关、日志级别、调试选项，不要把它当成通用 secrets 注入口。

### C. 创建或修改 cat

把目标猫配置成：

```text
client: acp
accountRef: <providerProfileId>
```

常见做法：

- `agentteams` 绑定 `relay-teams`
- `opencodeacp` 绑定 `opencode-acp`

## 测试方法

### 1. Provider 自检

先在 Hub 里点 `Test`，或者直接打：

```bash
curl -X POST http://127.0.0.1:3004/api/provider-profiles/<profileId>/test \
  -H 'Content-Type: application/json' \
  -H 'X-Cat-Cafe-User: default-user' \
  -d '{"projectPath":"/path/to/project"}'
```

期望返回：

```json
{"ok":true,"mode":"none","status":200}
```

### 2. 浏览器端到端

Provider test 通过后，再在对话框里直接发：

```text
@agentteams 请只回复一句“ACP OK”。
```

或：

```text
@opencodeacp 请只回复一句“ACP OK”。
```

如果链路正常，右侧 `Session Chain` 会出现新的 ACP session，消息气泡里会显示：

- 正文回复
- `providerId · acp` 的 metadata badge

### 2.1 MCP-over-ACP 验证

如果要验证 ACP host 提供的 MCP 真的被 agent 用起来，可以直接发送：

```text
@agentteams 先调用 load_skill 加载 deepresearch，再调用 cat_cafe_list_threads(limit=3)。最后只回复：
SKILL=<skill名>
THREADS=<返回数量>
```

期望结果：

- 消息气泡显示 `CLI Output · done · 2 tools`
- 最终文本类似 `SKILL=deepresearch` 与 `THREADS=<n>`
- `~/.relay-teams/log/backend.log` 里能看到 `mcp/connect`、`tools/list`、`tools/call`

可直接执行：

```bash
rg -n "mcp/connect|tools/list|tools/call" ~/.relay-teams/log/backend.log
```

### 2.2 中断恢复验证

如果要验证 ACP interrupted-session resume：

1. 先发送一个会持续流式输出的 prompt
2. 在前端点 `Stop generation`
3. 再通过 `Plan Board` 的“继续任务”按钮，或调用：

```bash
curl -X POST http://127.0.0.1:3004/api/messages \
  -H 'Content-Type: application/json' \
  -H 'X-Cat-Cafe-User: default-user' \
  -d '{"threadId":"<threadId>","content":"继续恢复被中断的输出","resumeCatId":"agentteams"}'
```

期望结果：

- ACP provider 走 `session/load -> session/resume`
- 恢复后的首个文本 chunk 从新的断点继续，而不是从先前的 `LINE0001` 或旧前缀重放
- 最终 thread 中不残留卡住的 `draft-*` 消息

### 3. 带环境变量的端到端验证

如果你要确认 ACP provider 的自定义环境变量真的进了 agent 运行时，推荐用 `relay-teams` 做最小验证：

1. 在 Hub 的 `relay-teams` provider 上填写：

```text
ACP_TRACE_STDIO=1
RELAY_TEAMS_LOG_LEVEL=DEBUG
```

2. 保存后确认 provider 卡片摘要出现：

```text
环境变量: ACP_TRACE_STDIO, RELAY_TEAMS_LOG_LEVEL
```

3. 再在聊天框发送：

```text
@agentteams 请只回复 ENV OK
```

4. 期望结果：

- 前端收到 `ENV OK`
- 消息气泡 metadata 仍然显示 `relay-teams · acp`
- 右侧 `Session Chain` 出现新的 ACP session

5. 如需进一步确认 env 已进入 `relay-teams` 子进程，可观察：

- `~/.relay-teams/log/backend.log` 里出现 `gateway.acp.inbound` / `gateway.acp.outbound`
- 这依赖 `ACP_TRACE_STDIO=1` 和 `RELAY_TEAMS_LOG_LEVEL=DEBUG` 同时生效

可直接执行：

```bash
rg -n "gateway\\.acp\\.(inbound|outbound)" ~/.relay-teams/log/backend.log
```

如果你还想确认 `clowder_default_profile` 的模型下发确实到达 `relay-teams`，可以读取它的会话数据库：

```bash
python - <<'PY'
import json
import sqlite3
from pathlib import Path

path = Path.home() / ".relay-teams" / "relay_teams.db"
conn = sqlite3.connect(path)
conn.row_factory = sqlite3.Row
row = conn.execute(
    """
    select gateway_session_id, channel_state_json
    from gateway_sessions
    order by rowid desc
    limit 1
    """
).fetchone()
state = json.loads(row["channel_state_json"] or "{}")
print("session:", row["gateway_session_id"])
print(json.dumps(state.get("acp_model_profile_override"), ensure_ascii=False, indent=2, sort_keys=True))
PY
```

正常情况下能看到：

- `provider`
- `model`
- `baseUrl`

这说明 `session/new` 确实带上了 `modelProfileOverride`，而不是只在 Clowder 侧“看起来已配置”。

## 排障

### `command not found`

- 确认 CLI 已安装
- 确认服务进程的 PATH 能解析到对应命令
- 对 `relay-teams`，优先检查 `which relay-teams`

### `ACP model profile ... not found or missing apiKey`

- `defaultModelProfileRef` 指向了不存在的 profile
- 或者 profile 元数据存在，但 secrets 里没有 apiKey

### `modelProfileOverride requires model, baseUrl, and apiKey`

- 说明这条链路跑的是 `clowder_default_profile`
- 但运行时拿到的 ACP Model Profile 不完整
- 优先通过 Hub/API 读取运行态 profile，不要只看明文 meta 文件

### ACP agent 能启动，但前端里 `@cat` 不出现

- 检查 cat catalog 里是否有对应 `client: acp` 的猫
- 检查 `accountRef` 是否绑定到了正确的 provider profile
- 检查 mention pattern 是否包含你实际输入的 `@name`

## 存储位置

- 默认存储根目录：`$HOME/.cat-cafe/`
- 如设置了 `CAT_CAFE_GLOBAL_CONFIG_ROOT`，则改为 `<CAT_CAFE_GLOBAL_CONFIG_ROOT>/.cat-cafe/`
- provider 元信息：`<storageRoot>/.cat-cafe/provider-profiles.json`
- provider secrets：`<storageRoot>/.cat-cafe/provider-profiles.secrets.local.json`
- ACP model 元信息：`<storageRoot>/.cat-cafe/acp-model-profiles.json`
- ACP model secrets：`<storageRoot>/.cat-cafe/acp-model-profiles.secrets.local.json`

旧的项目内 `.cat-cafe/provider-profiles.json` 会在读取时自动迁移到全局存储根。

如果你手动导出或备份这些配置文件，meta 文件可以按团队约定管理，secrets 文件不要进 Git。
