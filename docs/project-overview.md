# Clowder AI 项目整体介绍

## 1. 项目定位

Clowder AI 是一个多模型、多智能体协作平台。它的目标不是替代现有模型或 Agent CLI，而是在它们之上提供统一的平台层，让 Claude、Codex/GPT、Gemini、opencode 等不同智能体可以在同一个产品中协同工作。

项目核心关注点包括：

- 智能体身份与角色长期保持
- 多智能体协作与消息路由
- 共享记忆、证据和项目上下文
- Skills 体系与 MCP 工具接入
- 审查、治理、SOP 和任务推进流程
- Web UI、桌面启动器、Windows 离线安装包等交付形态

可以把它理解为三层结构：

- 模型层：负责推理与生成
- Agent CLI 层：负责工具调用、终端操作、文件读写
- Clowder 平台层：负责身份、路由、协作、治理、审计和产品化体验

## 2. 产品能力概览

当前项目已经覆盖的核心产品能力主要包括：

- 多智能体聊天协作：在同一线程内通过 `@mention` 将任务路由给不同智能体
- 跨模型协作：不同模型承担不同职责，例如架构、实现、评审、设计、研究
- 线程隔离：每个主题、功能或任务可以独立维护上下文
- 共享记忆与证据沉淀：支持长期知识积累，而不是每次对话重新开始
- Skills 体系：按需加载技能，减少无关提示词污染
- MCP 集成：统一对接工具能力，支持跨模型共享
- Hub / Mission Hub：面向任务、能力、配额、路由、配置的可视化管理
- 审查与治理流程：支持设计门禁、SOP、Feature 文档、审查链路
- 多入口交互：不仅有 Web UI，也支持桌面化和部分外部聊天平台接入
- 语音与富消息能力：支持更自然的交互形式

## 3. 代码结构

项目采用 monorepo 结构，根目录下最重要的目录如下：

```text
clowder-ai/
├─ packages/              核心应用与服务
├─ scripts/               启动、安装、打包、检查脚本
├─ docs/                  设计文档、功能文档、ADR、路线图
├─ packaging/             安装包与桌面启动器资源
├─ cat-cafe-skills/       技能库
├─ vendor/                外部集成或内嵌子项目
├─ config/                配置资源
├─ dist/                  构建与打包产物
└─ .cat-cafe/             本地运行时数据与缓存目录
```

### 3.1 `packages/`

`packages/` 是业务核心，当前包含：

- `packages/web`
  负责前端界面，基于 Next.js。包含聊天界面、Hub、Mission Hub、线程页、展示页以及前端状态管理逻辑。
- `packages/api`
  负责后端 API 与平台编排逻辑，是系统的大脑中枢。包含路由、服务层、集成层、任务/线程/记忆等领域逻辑。
- `packages/shared`
  提供前后端共享的类型、schema、工具函数、注册表等公共能力。
- `packages/mcp-server`
  提供 MCP 服务能力，用于将工具能力暴露给智能体。
- `packages/xinsheng-mcp`
  一个额外的 MCP 包，包含浏览器自动化等相关能力扩展。

### 3.2 `scripts/`

`scripts/` 主要承担项目运维入口：

- 启动脚本：`start-entry.mjs`、`start-windows.ps1`、`start-dev.sh`
- 运行时 worktree 管理：`runtime-worktree.sh`
- 安装脚本：`install.sh`、`install.ps1`
- Windows 打包脚本：`build-windows-installer.mjs`
- Windows 桌面启动器构建脚本：`build-windows-webview2-launcher.ps1`
- Python wheelhouse / runtime 准备脚本
- 检查类脚本：feature 校验、端口校验、目录体积检查等

### 3.3 `docs/`

`docs/` 是项目知识中心，包含：

- 愿景文档：`VISION.md`
- 路线图：`ROADMAP.md`
- SOP：`SOP.md`
- 架构文档：`docs/architecture/`
- 架构决策记录：`docs/decisions/`
- 功能规格文档：`docs/features/`
- Windows 离线安装包文档：`docs/windows-offline-installer.md`

### 3.4 `packaging/`

与发布产物相关的静态资源放在这里，尤其是 Windows 交付链路：

- `packaging/windows/installer.nsi`：NSIS 安装器脚本
- `packaging/windows/desktop/ClowderDesktop.cs`：桌面宿主程序
- `packaging/windows/assets/`：图标、启动图等资源
- `packaging/windows/python-runtime-wheelhouse.json`：Python 运行时轮子配置

### 3.5 `cat-cafe-skills/`

这里是项目内置技能库，覆盖文档处理、PDF、PPT、MCP 构建、协作思考、主动代理、搜索、天气等能力。平台可以按需挂载和分发这些技能给不同智能体。

### 3.6 `vendor/`

目前主要包含两个内嵌项目：

- `vendor/dare-cli`
- `vendor/jiuwenclaw`

它们参与项目的运行时能力或打包流程，尤其在 Windows 离线包和 Python 相关链路中会被纳入最终交付。

## 4. 运行形态与系统组成

从运行视角看，项目主要由以下几部分组成：

- 前端：`packages/web`
- 后端 API：`packages/api`
- 共享模块：`packages/shared`
- MCP 服务：`packages/mcp-server`
- Redis：持久化线程、消息、任务、记忆等状态
- 本地文件与 SQLite：部分证据、日志和附加数据

默认端口：

- 前端：`3003`
- API：`3004`
- Redis：`6399`

如果使用 Windows 桌面版，桌面宿主会启动本地服务，再通过 WebView2 打开产品界面。

## 5. 启动方式

### 5.1 环境要求

常规开发和运行至少需要：

- Node.js `20+`
- pnpm `9+`
- Git
- Redis `7+`，如果只是体验，也可以使用 `--memory`

首次启动前建议执行：

```bash
pnpm install
pnpm build
```

同时需要基于 `.env.example` 准备 `.env`，至少配置一个可用的模型提供方或相关认证信息。

### 5.2 标准启动

根目录常用启动命令如下：

```bash
pnpm start
```

`pnpm start` 会通过 `scripts/start-entry.mjs` 进入平台启动流程。

在非 Windows 环境下，它默认使用 runtime worktree 模式：

- 首次运行时创建独立运行时 worktree
- 同步运行时代码
- 构建需要的包
- 启动 Redis、API、前端

这个模式的优点是把“开发工作区”和“实际运行工作区”分离，减少本地脏状态对运行环境的影响。

### 5.3 直接在当前工作区启动

如果不想使用 runtime worktree，可以直接：

```bash
pnpm start:direct
```

开发模式可以使用：

```bash
pnpm dev:direct
```

适用场景：

- 当前就在本仓库里调试
- 不希望额外创建运行时 worktree
- 需要更直接地观察本地改动效果

### 5.4 内存模式启动

如果本机没有 Redis，或者只是临时体验，可使用：

```bash
pnpm start --memory
```

或：

```bash
pnpm start:direct -- --memory
```

这会跳过 Redis，改为使用内存存储。缺点是重启后数据不会保留。

### 5.5 快速启动

如果当前已经完成构建，只想快速拉起服务，可使用：

```bash
pnpm start --quick
```

或在 Windows 上：

```powershell
.\scripts\start-windows.ps1 -Quick
```

它会尽量复用现有构建产物，减少等待时间。

### 5.6 Windows 启动

Windows 侧主要通过 PowerShell 脚本启动：

```powershell
.\scripts\start-windows.ps1
```

常见参数：

- `-Quick`：跳过重建
- `-Memory`：不启 Redis，走内存模式
- `-Dev`：开发模式
- `-Debug`：输出更详细日志

## 6. 常用开发命令

根目录常用命令如下：

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm check
```

一些高频命令：

```bash
pnpm check:features
pnpm check:env-ports
pnpm check:deps
pnpm test:api:redis
pnpm runtime:init
pnpm runtime:sync
pnpm runtime:status
```

Redis 相关命令：

```bash
pnpm redis:user:start
pnpm redis:user:stop
pnpm redis:user:status
pnpm redis:user:backup
```

线程导出相关命令：

```bash
pnpm threads:export:redis
pnpm threads:export:redis:dry-run
pnpm threads:sync
pnpm threads:status
```

## 7. 打包与发布方式

当前仓库里最明确、最完整的一条打包链路是 Windows 离线安装包。

### 7.1 Windows 离线 bundle

先生成 bundle：

```bash
pnpm package:windows:bundle
```

输出目录：

- `dist/windows/bundle`

这个步骤会准备运行时布局，但不会生成最终 `.exe` 安装器。

### 7.2 Windows 安装器

生成完整 Windows 安装包：

```bash
pnpm package:windows
```

输出目录：

- `dist/windows/ClowderAI-<version>-windows-x64-setup.exe`

打包内容大致包括：

- 预构建的 `web`、`api`、`mcp-server`
- Windows Node Runtime
- 可移植 Redis
- WebView2 桌面启动器
- 项目运行所需脚本、技能和部分 vendor 运行时

### 7.3 Windows 打包链路说明

核心脚本：

- `scripts/build-windows-installer.mjs`
- `scripts/build-windows-webview2-launcher.ps1`
- `packaging/windows/installer.nsi`

发布流程大致是：

1. 构建共享包、API、MCP Server、Web
2. 复制运行时需要的项目文件
3. 准备 Python embeddable runtime 与依赖
4. 准备 Windows Node runtime
5. 准备便携式 Redis
6. 安装运行时依赖
7. 构建 WebView2 桌面宿主
8. 生成 bundle 或进一步生成 NSIS `.exe`

### 7.4 发布注意事项

- Windows 安装器依赖 `makensis`
- 默认安装路径较短，主要是为了规避 Windows 路径长度问题
- 安装和升级会尽量保留用户运行数据，如 `.env`、`data/`、`logs/`、`.cat-cafe/`
- 如果只做开发调试，一般不需要走打包链路

## 8. 配置与数据

项目运行时常见配置与数据包括：

- `.env`：环境变量与模型/平台接入配置
- `.env.example`：环境变量模板
- `cat-config.json`：项目配置
- `.cat-cafe/`：本地运行数据、缓存、Redis 相关内容
- `data/`、`logs/`：业务运行数据与日志

需要注意的是，运行配置和用户数据是项目的重要状态资产，升级或打包链路通常会尽量保留它们。

## 9. 适合谁阅读这个仓库

这份仓库同时面向几类角色：

- 产品/项目负责人：了解平台定位、能力边界和交付方式
- 前端/后端开发：进入 `packages/web`、`packages/api` 继续细看实现
- 平台/基础设施同学：关注 `scripts/`、`packaging/`、`docs/architecture/`
- AI 协作流程设计者：关注 `docs/SOP.md`、`docs/features/`、`cat-cafe-skills/`

## 10. 推荐阅读路径

如果你是第一次接触这个项目，建议按下面顺序阅读：

1. `README.md`：先理解项目愿景与对外定位
2. `SETUP.md`：了解本地环境准备与启动方式
3. `docs/project-overview.md`：建立整体结构认知
4. `docs/README.md`：按主题继续深入
5. `docs/architecture/` 与 `docs/decisions/`：理解关键技术方案
6. `docs/features/`：查看具体功能规格和演进历史

## 11. 一句话总结

Clowder AI 不是单一模型聊天工具，而是一个把多种 AI 智能体组织成“可协作、可治理、可交付”的产品化平台。
